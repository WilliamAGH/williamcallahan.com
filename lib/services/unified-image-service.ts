/**
 * Unified image service - fetching, processing, caching
 * Memory-safe operations with S3/CDN delivery
 * @module lib/services/unified-image-service
 */
import { s3Client, writeBinaryS3, checkIfS3ObjectExists } from "../s3-utils";
import { ServerCacheInstance, getDeterministicTimestamp } from "../server-cache";
import { getDomainVariants } from "../utils/domain-utils";
import {
  parseS3Key,
  generateS3Key,
  getFileExtension,
  getBufferHash,
  hashAndArchiveManualLogo,
} from "../utils/hash-utils";
import { LOGO_SOURCES, LOGO_BLOCKLIST_S3_PATH, UNIFIED_IMAGE_SERVICE_CONFIG } from "../constants";
import { getBaseUrl } from "../utils/get-base-url";
import { isDebug } from "../utils/debug";
import { isS3ReadOnly } from "../utils/s3-read-only";
import type { LogoSource, LogoInversion } from "../../types/logo";
import type { ExternalFetchResult, ImageServiceOptions, ImageResult } from "../../types/image";
import { extractBasicImageMeta } from "../image-handling/image-metadata";
import { analyzeImage } from "../image-handling/image-analysis"; // now lightweight stub
import { processImageBuffer as sharedProcessImageBuffer } from "../image-handling/shared-image-processing";
import {
  fetchWithTimeout,
  DEFAULT_IMAGE_HEADERS,
  getBrowserHeaders,
  fetchBinary,
  isRetryableHttpError,
} from "../utils/http-client";
import { retryWithOptions, computeExponentialDelay } from "../utils/retry";
import { FailureTracker } from "../utils/failure-tracker";
import { isOperationAllowedWithCircuitBreaker, recordOperationFailure } from "../rate-limiter";
import { inferContentTypeFromUrl, getExtensionFromContentType, IMAGE_EXTENSIONS } from "../utils/content-type";
import { buildCdnUrl } from "../utils/cdn-utils";
import { isLogoUrl, extractDomain } from "../utils/url-utils";
import { getMemoryHealthMonitor, wipeBuffer } from "../health/memory-health-monitor";

import { monitoredAsync } from "../async-operations-monitor";
import type { LogoFetchResult, LogoValidationResult } from "../../types/cache";
import { logoDebugger } from "@/lib/utils/logo-debug";
import { maybeStreamImageToS3 } from "./image-streaming";
import logger from "../utils/logger";

export class UnifiedImageService {
  // Migration lock moved to centralized async-lock utility
  private readonly isReadOnly = isS3ReadOnly();
  private readonly isDev = process.env.NODE_ENV !== "production";
  private readonly devProcessingDisabled =
    this.isDev &&
    (process.env.DEV_DISABLE_IMAGE_PROCESSING === "1" || process.env.DEV_DISABLE_IMAGE_PROCESSING === "true");
  private readonly devStreamImagesToS3 =
    this.isDev && (process.env.DEV_STREAM_IMAGES_TO_S3 === "1" || process.env.DEV_STREAM_IMAGES_TO_S3 === "true");

  // Removed sessionProcessedDomains as it was never used
  private sessionFailedDomains = new Set<string>();
  private domainRetryCount = new Map<string, number>();
  private domainFirstFailureTime = new Map<string, number>(); // Track when domain first failed
  private sessionStartTime = getDeterministicTimestamp();
  private lastCleanupTime = getDeterministicTimestamp();

  // Request deduplication for concurrent logo fetches
  private inFlightLogoRequests = new Map<string, Promise<LogoFetchResult>>();
  private readonly CONFIG = UNIFIED_IMAGE_SERVICE_CONFIG;
  private uploadRetryQueue = new Map<
    string,
    { sourceUrl: string; contentType: string; attempts: number; lastAttempt: number; nextRetry: number }
  >();
  private retryTimerId: NodeJS.Timeout | null = null;

  // Use FailureTracker for domain blocklist management
  private domainFailureTracker = new FailureTracker<string>(domain => domain, {
    s3Path: LOGO_BLOCKLIST_S3_PATH,
    maxRetries: this.CONFIG.PERMANENT_FAILURE_THRESHOLD,
    cooldownMs: 24 * 60 * 60 * 1000, // 24 hours
    maxItems: this.CONFIG.MAX_BLOCKLIST_SIZE,
    name: "UnifiedImageService-DomainTracker",
  });

  constructor() {
    // S3 utils already validate environment on first use
    this.startPeriodicCleanup();
    if (process.env.NODE_ENV === "production" && !process.env.S3_CDN_URL && !process.env.S3_BUCKET) {
      throw new Error("UnifiedImageService: Either S3_CDN_URL or S3_BUCKET must be set in production.");
    }
    console.log(`[UnifiedImageService] Initialized in ${this.isReadOnly ? "READ-ONLY" : "READ-WRITE"} mode`);
    this.startRetryProcessing();
    void this.domainFailureTracker.load();
  }

  /** Fetch image with caching (memory → S3 → origin) */
  async getImage(url: string, options: ImageServiceOptions = {}): Promise<ImageResult> {
    // Prefer streaming-to-S3 behavior over full processing in development when requested
    // Note: When enabled, we still attempt normal fetch logic; processing will be skipped in fetchAndProcess.
    if (!this.devStreamImagesToS3 && this.devProcessingDisabled) {
      const transparentPngBase64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO3GdQAAAABJRU5ErkJggg==";
      const placeholder = Buffer.from(transparentPngBase64, "base64");
      return {
        buffer: placeholder,
        contentType: "image/png",
        source: "placeholder",
        timestamp: getDeterministicTimestamp(),
      };
    }

    const memoryMonitor = getMemoryHealthMonitor();
    // When streaming mode is enabled for dev, allow the request to proceed; streaming uses bounded memory.
    if (!this.devStreamImagesToS3 && !memoryMonitor.shouldAcceptNewRequests()) {
      throw new Error("Insufficient memory to process image request");
    }
    return monitoredAsync(
      null,
      `get-image-${url}`,
      async () => {
        const s3Key = this.generateS3Key(url, options);
        if (!options.forceRefresh && (await checkIfS3ObjectExists(s3Key))) {
          return { contentType: inferContentTypeFromUrl(url), source: "s3", cdnUrl: this.getCdnUrl(s3Key) };
        }
        if (this.isReadOnly) throw new Error(`Image not available in read-only mode: ${url}`);

        let result: { buffer: Buffer; contentType: string; streamedToS3?: boolean } | null = null;
        try {
          result = await this.fetchAndProcess(url, options);
          if (!result.streamedToS3 && !this.isReadOnly) {
            await this.uploadToS3(s3Key, result.buffer, result.contentType);
          }
          return {
            buffer: result.buffer,
            contentType: result.contentType,
            source: "origin",
            cdnUrl: this.getCdnUrl(s3Key),
          };
        } finally {
          // Clear buffer reference to help GC
          wipeBuffer(result?.buffer);
          result = null;
        }
      },
      { timeoutMs: this.CONFIG.FETCH_TIMEOUT, metadata: { url, options } },
    );
  }

  /** Get logo with validation, optional inversion */
  async getLogo(domain: string, options: ImageServiceOptions = {}): Promise<LogoFetchResult> {
    // Check memory before starting (relaxed when streaming mode is enabled in dev)
    const memoryMonitor = getMemoryHealthMonitor();
    if (!this.devStreamImagesToS3 && !memoryMonitor.shouldAcceptNewRequests()) {
      return {
        domain,
        source: null,
        contentType: "image/png",
        error: "Insufficient memory to process logo request",
        timestamp: getDeterministicTimestamp(),
        isValid: false,
      };
    }

    // Check if there's already an in-flight request for this domain
    const existingRequest = this.inFlightLogoRequests.get(domain);
    if (existingRequest && !options.forceRefresh) {
      console.log(`[UnifiedImageService] Reusing in-flight request for domain: ${domain}`);
      return existingRequest;
    }

    // Create new request promise
    const requestPromise = monitoredAsync(
      null,
      `get-logo-${domain}`,
      async () => {
        const cachedResult = ServerCacheInstance.getLogoFetch(domain);
        if (cachedResult?.s3Key && (this.isReadOnly || !options.forceRefresh)) {
          return { ...cachedResult, cdnUrl: this.getCdnUrl(cachedResult.s3Key) };
        }

        /**
         * 🔍 S3 CDN Read Operations (ALLOWED during builds)
         *
         * These operations check if logos already exist in S3/CDN and are safe to run
         * during build phase. They only perform read operations (HEAD requests, list operations)
         * and never write to S3.
         *
         * Benefits:
         * - Allows builds to serve existing logos from CDN
         * - No S3 write operations = no build-time mutations
         * - Respects the private/public CDN setup
         */

        // First check for existing hashed logo files using deterministic key generation
        const { checkIfS3ObjectExists } = await import("@/lib/s3-utils");

        for (const source of ["direct", "google", "duckduckgo", "clearbit"] as LogoSource[]) {
          // Check common logo extensions
          for (const extension of ["png", "jpg", "jpeg", "svg", "ico", "webp"]) {
            const hashedKey = generateS3Key({
              type: "logo",
              domain,
              source,
              extension,
            });

            try {
              const exists = await checkIfS3ObjectExists(hashedKey);
              if (exists) {
                console.log(`[UnifiedImageService] Found existing hashed logo: ${hashedKey}`);

                const contentType =
                  extension === "svg" ? "image/svg+xml" : extension === "ico" ? "image/x-icon" : `image/${extension}`;

                const cachedResult: LogoFetchResult = {
                  domain,
                  s3Key: hashedKey,
                  cdnUrl: this.getCdnUrl(hashedKey),
                  url: undefined,
                  source,
                  contentType,
                  timestamp: getDeterministicTimestamp(),
                  isValid: true,
                } as LogoFetchResult;

                ServerCacheInstance.setLogoFetch(domain, cachedResult);
                return cachedResult;
              }
            } catch {
              // File doesn't exist, continue to next extension/source
            }
          }
        }

        // If no hashed files found, check for legacy files (without hashes)
        const { findLegacyLogoKey } = await import("../utils/hash-utils");
        const { listS3Objects } = await import("../s3-utils");
        const legacyKey = await findLegacyLogoKey(domain, listS3Objects);

        if (legacyKey) {
          console.log(`[UnifiedImageService] Found existing legacy logo: ${legacyKey}`);

          // Extract metadata from key
          const parsed = parseS3Key(legacyKey);
          const source = parsed.source as LogoSource;
          const ext = parsed.extension || "png";
          const contentType = ext === "svg" ? "image/svg+xml" : ext === "ico" ? "image/x-icon" : `image/${ext}`;

          /**
           * 🚫 S3 Write Operations (BLOCKED during builds)
           *
           * Logo migration/hashing requires S3 writes and must only run at runtime
           * or during data-updater scripts. During builds, we return the legacy key
           * as-is without migration.
           */
          let finalKey = legacyKey;
          if (!parsed.hash && !this.isReadOnly) {
            const { readBinaryS3, writeBinaryS3, deleteFromS3 } = await import("../s3-utils");
            const migrated = await hashAndArchiveManualLogo(domain, {
              listS3Objects,
              readBinaryS3,
              writeBinaryS3,
              deleteFromS3,
            });
            if (migrated) {
              finalKey = migrated;
              console.log(`[UnifiedImageService] Manual logo migrated → ${migrated}`);
            }
          }

          const cachedResult: LogoFetchResult = {
            domain,
            s3Key: finalKey,
            cdnUrl: this.getCdnUrl(finalKey),
            url: undefined,
            source,
            contentType,
            timestamp: getDeterministicTimestamp(),
            isValid: true,
          } as LogoFetchResult;

          ServerCacheInstance.setLogoFetch(domain, cachedResult);
          return cachedResult;
        }

        /**
         * 🚫 No Logo Found in CDN
         *
         * If we reach this point during a build (read-only mode), we cannot fetch
         * from external sources as that would require uploading to S3. Return an
         * error that indicates the logo needs to be fetched during runtime.
         */
        if (this.isReadOnly) {
          if (this.isDev) {
            console.info(`[UnifiedImageService] Read-only: logo not found in CDN for domain '${domain}'`);
          }
          return {
            domain,
            source: null,
            contentType: "image/png",
            error: "Logo not available in CDN (fetch required at runtime)",
            timestamp: getDeterministicTimestamp(),
            isValid: false,
          };
        }

        // Not found in S3, try external sources
        logoDebugger.logAttempt(domain, "s3-check", "No existing logo found in S3", "failed");

        try {
          const logoData = await this.fetchExternalLogo(domain);
          if (!logoData?.buffer) {
            logoDebugger.logAttempt(domain, "external-fetch", "All external sources failed", "failed");
            throw new Error("No logo found");
          }

          // In streaming mode for dev: skip heavy validation/inversion and persist the original buffer
          if (this.devStreamImagesToS3) {
            const ext = getExtensionFromContentType(logoData.contentType || "image/png");
            const s3KeyStreaming = generateS3Key({
              type: "logo",
              domain,
              source: logoData.source,
              url: logoData.url || `https://${domain}/logo.${ext}`,
              extension: ext,
            });
            if (!this.isReadOnly)
              await this.uploadToS3(s3KeyStreaming, logoData.buffer, logoData.contentType || "image/png");
            const streamingResult: LogoFetchResult = {
              domain,
              url: logoData.url,
              cdnUrl: this.getCdnUrl(s3KeyStreaming),
              s3Key: s3KeyStreaming,
              source: logoData.source,
              contentType: logoData.contentType,
              timestamp: getDeterministicTimestamp(),
              isValid: true,
            } as LogoFetchResult;
            ServerCacheInstance.setLogoFetch(domain, streamingResult);
            logoDebugger.setFinalResult(
              domain,
              true,
              streamingResult.source || undefined,
              streamingResult.s3Key,
              streamingResult.cdnUrl,
            );
            logoDebugger.printDebugInfo(domain);
            return streamingResult;
          }

          const validation = await this.validateLogo(logoData.buffer);
          const isValid = !validation.isGlobeIcon;
          let finalBuffer = logoData.buffer;
          let s3Key: string;
          if (isValid && options.invertColors) {
            const inverted = await this.invertLogo(logoData.buffer, domain);
            if (inverted.buffer) {
              finalBuffer = inverted.buffer;
              const ext = getExtensionFromContentType(logoData.contentType || "image/png");
              s3Key = generateS3Key({
                type: "logo",
                domain,
                source: logoData.source,
                url: logoData.url || `https://${domain}/logo.${ext}`,
                extension: ext,
                inverted: true,
              });
              ServerCacheInstance.setInvertedLogo(domain, {
                s3Key,
                cdnUrl: this.getCdnUrl(s3Key),
                analysis: inverted.analysis || {
                  needsDarkInversion: false,
                  needsLightInversion: false,
                  hasTransparency: false,
                  brightness: 0.5,
                  format: "png",
                  dimensions: { width: 0, height: 0 },
                },
                contentType: logoData.contentType || "image/png",
              });
            } else {
              // If inversion failed but was requested, still generate the key for non-inverted version
              const ext = getExtensionFromContentType(logoData.contentType || "image/png");
              s3Key = generateS3Key({
                type: "logo",
                domain,
                source: logoData.source,
                url: logoData.url || `https://${domain}/logo.${ext}`,
                extension: ext,
              });
            }
          } else {
            const ext = getExtensionFromContentType(logoData.contentType || "image/png");
            s3Key = generateS3Key({
              type: "logo",
              domain,
              source: logoData.source,
              url: logoData.url || `https://${domain}/logo.${ext}`,
              extension: ext,
            });
          }
          if (!this.isReadOnly) await this.uploadToS3(s3Key, finalBuffer, logoData.contentType || "image/png");
          const result: LogoFetchResult = {
            domain,
            url: logoData.url,
            cdnUrl: this.getCdnUrl(s3Key),
            s3Key,
            source: logoData.source,
            contentType: logoData.contentType,
            timestamp: getDeterministicTimestamp(),
            isValid,
            isGlobeIcon: validation.isGlobeIcon,
          };
          ServerCacheInstance.setLogoFetch(domain, result);
          logoDebugger.setFinalResult(domain, true, result.source || undefined, result.s3Key, result.cdnUrl);
          logoDebugger.printDebugInfo(domain);
          return result;
        } catch (error) {
          const errorResult: LogoFetchResult = {
            domain,
            source: null,
            contentType: "image/png",
            error: error instanceof Error ? error.message : "Unknown error",
            timestamp: getDeterministicTimestamp(),
            isValid: false,
          };
          ServerCacheInstance.setLogoFetch(domain, errorResult);
          logoDebugger.setFinalResult(domain, false);
          logoDebugger.printDebugInfo(domain);
          return errorResult;
        }
      },
      { timeoutMs: this.CONFIG.FETCH_TIMEOUT, metadata: { domain, options } },
    );

    if (this.inFlightLogoRequests.size >= this.CONFIG.MAX_IN_FLIGHT_REQUESTS) {
      const firstKey = this.inFlightLogoRequests.keys().next().value;
      if (firstKey) this.inFlightLogoRequests.delete(firstKey);
    }
    this.inFlightLogoRequests.set(domain, requestPromise);

    // Clean up after completion (success or failure)
    requestPromise.finally(() => setTimeout(() => this.inFlightLogoRequests.delete(domain), 100)).catch(() => {});

    return requestPromise;
  }

  /**
   * Invert logo buffer (dark-theme variant) and persist to S3.
   * Returns the inversion analysis along with CDN URL of the inverted logo.
   */
  private async invertLogo(
    buffer: Buffer,
    domain: string,
  ): Promise<{ buffer?: Buffer; analysis?: LogoInversion; cdnUrl?: string }> {
    try {
      // Import dynamically to avoid cost when not needed.
      const { invertLogoBuffer } = await import("@/lib/image-handling/invert-logo");

      // Run analysis & inversion in parallel where possible
      const analysisPromise = this.analyzeLogo(buffer, domain);
      const inversionPromise = invertLogoBuffer(buffer, "UnifiedImageService.invertLogo");

      const [analysis, inverted] = await Promise.all([analysisPromise, inversionPromise]);

      const invertedBuffer = inverted.buffer;
      if (!invertedBuffer || invertedBuffer.length === 0) {
        return { buffer: buffer, analysis }; // Fallback – return original buffer
      }

      // Persist inverted logo to dedicated S3 path for cache-friendly retrieval
      const s3Key = `images/logos/inverted/${domain}.${inverted.contentType.split("/")[1] || "png"}`;

      if (!this.isReadOnly) {
        await this.uploadToS3(s3Key, invertedBuffer, inverted.contentType);
      }

      const cdnUrl = this.getCdnUrl(s3Key);

      return { buffer: invertedBuffer, analysis, cdnUrl };
    } catch (error) {
      logger.error(`[UnifiedImageService] Failed to invert logo`, error, { domain });
      return {};
    }
  }

  private async fetchAndProcess(
    url: string,
    options: ImageServiceOptions,
  ): Promise<{ buffer: Buffer; contentType: string; streamedToS3?: boolean }> {
    // Dev gating: skip fetch/processing entirely when disabled in development
    if (this.devProcessingDisabled && !this.devStreamImagesToS3) {
      const transparentPngBase64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO3GdQAAAABJRU5ErkJggg==";
      return { buffer: Buffer.from(transparentPngBase64, "base64"), contentType: "image/png" };
    }

    // Check memory before fetching unless we are in streaming mode (streaming uses bounded memory)
    const memoryMonitor = getMemoryHealthMonitor();
    if (!this.devStreamImagesToS3 && !memoryMonitor.shouldAcceptNewRequests()) {
      throw new Error("Insufficient memory to fetch image");
    }

    if (isLogoUrl(url)) {
      const logoResult = await this.fetchExternalLogo(extractDomain(url));
      if (!logoResult?.buffer) throw new Error("Failed to fetch logo");
      const result = { buffer: logoResult.buffer, contentType: logoResult.contentType || "image/png" };
      logoResult.buffer = Buffer.alloc(0);
      return result;
    }

    const response = await fetchWithTimeout(url, {
      headers: DEFAULT_IMAGE_HEADERS,
      timeout: this.CONFIG.FETCH_TIMEOUT,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    const contentType = response.headers.get("content-type");
    if (!contentType?.startsWith("image/")) throw new Error("Response is not an image");

    try {
      const s3Key = this.generateS3Key(url, options);
      const streamed = await maybeStreamImageToS3(response, {
        bucket: process.env.S3_BUCKET || "",
        key: s3Key,
        s3Client,
      });
      if (streamed) {
        return {
          buffer: Buffer.alloc(0),
          contentType: contentType || "application/octet-stream",
          streamedToS3: true,
        };
      }

      // If streaming failed and we're in streaming mode, only fall back to buffering if memory allows
      if (this.devStreamImagesToS3 && !memoryMonitor.shouldAcceptNewRequests()) {
        throw new Error("Streaming required but unavailable under memory pressure");
      }

      // Check memory again before loading into buffer
      if (!this.devStreamImagesToS3 && !memoryMonitor.shouldAcceptNewRequests()) {
        throw new Error("Insufficient memory to load image into buffer");
      }

      const arrayBuffer = await response.arrayBuffer();
      let buffer = Buffer.from(arrayBuffer);

      try {
        // When DEV_STREAM_IMAGES_TO_S3 is enabled, skip any CPU-heavy processing and return original buffer
        if (this.devStreamImagesToS3) {
          return { buffer, contentType: contentType || "application/octet-stream" };
        }

        if (options.width || options.format || options.quality) {
          const processed = await this.processImageBuffer(buffer);
          // Clear original buffer after processing
          buffer = Buffer.alloc(0);
          return { buffer: processed.processedBuffer, contentType: processed.contentType };
        }
        return { buffer, contentType: contentType || "application/octet-stream" };
      } catch (error) {
        // Clear buffer on error
        buffer = Buffer.alloc(0);
        throw error;
      }
    } catch (error) {
      throw error instanceof Error ? error : new Error("Failed to fetch image");
    }
  }

  private async uploadToS3(key: string, buffer: Buffer, contentType: string): Promise<void> {
    try {
      await writeBinaryS3(key, buffer, contentType);
    } catch (error) {
      logger.error("[UnifiedImageService] S3 upload failed", error);
      this.trackFailedUpload(key, buffer, contentType, error);
    }
  }

  private trackFailedUpload(key: string, buffer: Buffer, contentType: string, error: unknown): void {
    // Enforce bounds on retry queue
    if (this.uploadRetryQueue.size >= this.CONFIG.MAX_RETRY_QUEUE_SIZE) {
      // Remove oldest entries when limit reached
      const entriesToRemove = Math.floor(this.CONFIG.MAX_RETRY_QUEUE_SIZE * 0.2); // Remove 20%
      const keys = Array.from(this.uploadRetryQueue.keys()).slice(0, entriesToRemove);
      for (const k of keys) {
        this.uploadRetryQueue.delete(k);
      }
      console.log(`[UnifiedImageService] Retry queue limit reached, removed ${entriesToRemove} oldest entries`);
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    const isMemoryPressure = errorMessage.includes("Insufficient memory headroom");
    if (isMemoryPressure) {
      const sourceUrl = this.extractSourceUrlFromKey(key);
      if (sourceUrl) {
        const existingRetry = this.uploadRetryQueue.get(key);
        const attempts = (existingRetry?.attempts || 0) + 1;
        if (attempts <= this.CONFIG.MAX_UPLOAD_RETRIES) {
          // Calculate exponential backoff with jitter
          const delay = computeExponentialDelay(
            attempts,
            this.CONFIG.RETRY_BASE_DELAY,
            this.CONFIG.RETRY_MAX_DELAY,
            this.CONFIG.RETRY_JITTER_FACTOR,
          );
          const nextRetry = getDeterministicTimestamp() + delay;
          this.uploadRetryQueue.set(key, {
            sourceUrl,
            contentType,
            attempts,
            lastAttempt: getDeterministicTimestamp(),
            nextRetry,
          });
          console.log(
            `[UnifiedImageService] S3 upload failed due to memory pressure. Retry ${attempts}/${this.CONFIG.MAX_UPLOAD_RETRIES} scheduled for ${new Date(nextRetry).toISOString()}`,
          );
        } else {
          console.log(`[UnifiedImageService] S3 upload failed after ${this.CONFIG.MAX_UPLOAD_RETRIES} attempts`);
          this.uploadRetryQueue.delete(key);
        }
      }
    } else {
      logger.error("[UnifiedImageService] S3 upload failed", error, {
        key,
        contentType,
        bufferSize: buffer.byteLength,
      });
    }
  }

  private extractSourceUrlFromKey(s3Key: string): string | null {
    if (!s3Key.includes("/logos/") && !s3Key.includes("/logo/")) return null;
    return parseS3Key(s3Key).domain ?? null;
  }

  private startRetryProcessing(): void {
    this.retryTimerId = setInterval(() => void this.processRetryQueue(), 60000);
    if (process.env.NODE_ENV !== "test") process.on("beforeExit", () => this.stopRetryProcessing());
  }
  private stopRetryProcessing(): void {
    if (this.retryTimerId) {
      clearInterval(this.retryTimerId);
      this.retryTimerId = null;
    }
  }

  private processRetryQueue(): void {
    const now = getDeterministicTimestamp();
    // Use memory health monitor instead of direct memory check
    const memoryMonitor = getMemoryHealthMonitor();
    if (!memoryMonitor.shouldAcceptNewRequests()) {
      console.log("[UnifiedImageService] Memory pressure detected, skipping retry processing");
      return;
    }
    for (const [key, retry] of this.uploadRetryQueue.entries()) {
      if (retry.nextRetry <= now) {
        console.log(
          `[UnifiedImageService] Retrying S3 upload for ${key} (attempt ${retry.attempts}/${this.CONFIG.MAX_UPLOAD_RETRIES})`,
        );
        // Use retryWithOptions for consistent retry behavior
        void retryWithOptions(
          async () => {
            const result = await this.getLogo(retry.sourceUrl);
            if (!result.cdnUrl) {
              throw new Error(result.error || "Logo fetch failed");
            }
            return result;
          },
          {
            maxRetries: this.CONFIG.MAX_UPLOAD_RETRIES - retry.attempts,
            baseDelay: this.CONFIG.RETRY_BASE_DELAY,
            isRetryable: error => isRetryableHttpError(error),
            onRetry: (error, attempt) => {
              void error; // Explicitly mark as unused per project convention
              console.log(
                `[UnifiedImageService] Retry ${attempt + retry.attempts}/${this.CONFIG.MAX_UPLOAD_RETRIES} for ${key}`,
              );
            },
          },
        )
          .then(result => {
            if (result?.cdnUrl) {
              this.uploadRetryQueue.delete(key);
              console.log(`[UnifiedImageService] Retry successful for ${key}`);
            }
          })
          .catch(error => {
            logger.error("[UnifiedImageService] All retries failed", error, { key });
            this.uploadRetryQueue.delete(key);
          });
      }
    }
  }

  private generateS3Key(
    url: string,
    options: ImageServiceOptions & { type?: string; source?: LogoSource; domain?: string; contentType?: string },
  ): string {
    if (options.type === "logo" && options.domain && options.source) {
      // For logos, extract extension from the filename in the URL, not from the domain
      let extension = "png"; // Default
      if (url) {
        // Only extract extension if it looks like a filename (has a proper image extension)
        const urlParts = url.split("/");
        const filename = urlParts[urlParts.length - 1] || "";
        const match = filename.match(/\.([a-zA-Z0-9]+)$/);
        if (match?.[1] && IMAGE_EXTENSIONS.includes(match[1].toLowerCase())) {
          extension = match[1].toLowerCase();
        } else if (options.contentType) {
          // Fall back to content type if available
          extension = getExtensionFromContentType(options.contentType);
        }
      }

      return generateS3Key({
        type: "logo",
        domain: options.domain,
        source: options.source,
        url,
        inverted: options.invertColors,
        extension,
      });
    } else {
      // For generic images
      return generateS3Key({
        type: "image",
        url,
        inverted: options.invertColors,
        variant: options.type,
        extension: getFileExtension(url),
      });
    }
  }

  /** Get CDN URL for S3 key */
  getCdnUrl(s3Key: string): string {
    return buildCdnUrl(s3Key, {
      cdnBaseUrl: process.env.S3_CDN_URL || process.env.NEXT_PUBLIC_S3_CDN_URL || "",
      s3BucketName: process.env.S3_BUCKET || "",
      s3ServerUrl: process.env.S3_SERVER_URL,
    });
  }

  /** Analyze logo from URL for inversion needs */
  async getLogoAnalysisByUrl(url: string): Promise<LogoInversion | null> {
    const cacheKey = `${url}-analysis`;
    const cached = ServerCacheInstance.getLogoAnalysis(cacheKey);
    if (cached) return cached;
    try {
      // Use shared fetch utilities with retry
      const { buffer } = await fetchBinary(url, {
        timeout: 10000,
        headers: DEFAULT_IMAGE_HEADERS,
      });
      return await this.analyzeLogo(buffer, url);
    } catch (error) {
      logger.error("[UnifiedImageService] Failed to analyze logo from URL", error, { url });
      return null;
    }
  }

  /** Validate logo buffer, check for globe icon */
  async validateLogo(buffer: Buffer): Promise<LogoValidationResult> {
    const bufferHash = getBufferHash(buffer);
    const cached = ServerCacheInstance.getLogoValidation(bufferHash);
    if (cached) return cached;

    // First check basic validation
    const isBasicValid = await this.validateLogoBuffer(buffer, "");
    if (!isBasicValid) {
      ServerCacheInstance.setLogoValidation(bufferHash, true); // It's a globe/invalid
      return { isGlobeIcon: true, timestamp: getDeterministicTimestamp() };
    }

    // Import analysis functions
    const { isBlankOrPlaceholder } = await import("@/lib/image-handling/image-analysis");
    const blankCheck = await isBlankOrPlaceholder(buffer);

    const isGlobeIcon = blankCheck.isBlank || blankCheck.isGlobe;
    ServerCacheInstance.setLogoValidation(bufferHash, isGlobeIcon);
    return { isGlobeIcon, timestamp: getDeterministicTimestamp() };
  }

  async analyzeLogo(buffer: Buffer, url: string): Promise<LogoInversion> {
    const cacheKey = `${url}-${getBufferHash(buffer)}`;
    const cached = ServerCacheInstance.getLogoAnalysis(cacheKey);
    if (cached) return cached;
    const analysis = await analyzeImage(buffer);
    ServerCacheInstance.setLogoAnalysis(cacheKey, analysis);
    return analysis;
  }

  private async fetchExternalLogo(domain: string): Promise<ExternalFetchResult | null> {
    if (await this.domainFailureTracker.shouldSkip(domain)) {
      console.log(`[UnifiedImageService] Domain ${domain} is permanently blocked or in cooldown, skipping`);
      logoDebugger.logAttempt(domain, "external-fetch", "Domain is blocked or in cooldown", "failed");
      return null;
    }
    if (this.hasDomainFailedTooManyTimes(domain)) {
      console.log(`[UnifiedImageService] Domain ${domain} has failed too many times in this session, skipping`);
      logoDebugger.logAttempt(domain, "external-fetch", "Domain has failed too many times", "failed");
      return null;
    }
    const domainVariants = getDomainVariants(domain);
    for (const testDomain of domainVariants) {
      // Type-safe access to LOGO_SOURCES with proper null checks
      const directSources = LOGO_SOURCES.direct;
      const googleSources = LOGO_SOURCES.google;
      const duckduckgoSources = LOGO_SOURCES.duckduckgo;
      const clearbitSources = LOGO_SOURCES.clearbit;
      const rawSources: Array<{ name: LogoSource; urlFn: ((d: string) => string) | undefined; size: string }> = [
        // Try high-quality icons first
        {
          name: "direct" as LogoSource,
          urlFn: directSources.androidChrome512,
          size: "android-512",
        },
        {
          name: "direct" as LogoSource,
          urlFn: directSources.androidChrome192,
          size: "android-192",
        },
        {
          name: "direct" as LogoSource,
          urlFn: directSources.appleTouchIcon180,
          size: "apple-180",
        },
        {
          name: "direct" as LogoSource,
          urlFn: directSources.appleTouchIcon152,
          size: "apple-152",
        },
        {
          name: "direct" as LogoSource,
          urlFn: directSources.appleTouchIcon,
          size: "apple-touch",
        },
        {
          name: "direct" as LogoSource,
          urlFn: directSources.appleTouchIconPrecomposed,
          size: "apple-touch-precomposed",
        },
        // Try standard favicon formats
        {
          name: "direct" as LogoSource,
          urlFn: directSources.faviconSvg,
          size: "favicon-svg",
        },
        {
          name: "direct" as LogoSource,
          urlFn: directSources.faviconPng,
          size: "favicon-png",
        },
        {
          name: "direct" as LogoSource,
          urlFn: directSources.favicon32,
          size: "favicon-32",
        },
        {
          name: "direct" as LogoSource,
          urlFn: directSources.favicon16,
          size: "favicon-16",
        },
        {
          name: "direct" as LogoSource,
          urlFn: directSources.favicon,
          size: "favicon-ico",
        },
        // Then try third-party services
        { name: "google", urlFn: googleSources?.hd, size: "hd" },
        { name: "google", urlFn: googleSources?.md, size: "md" },
        { name: "duckduckgo", urlFn: duckduckgoSources?.hd, size: "hd" },
        { name: "clearbit", urlFn: clearbitSources?.hd, size: "hd" },
      ];
      const sources = rawSources.filter(
        (source): source is { name: LogoSource; urlFn: (d: string) => string; size: string } =>
          source.urlFn !== undefined,
      );

      for (const { name, urlFn, size } of sources) {
        const result = await this.tryFetchLogo(testDomain, name, urlFn, size, domain);
        if (result) {
          // Success - remove from failure tracker if it was there
          this.domainFailureTracker.removeFailure(domain);
          logoDebugger.logAttempt(domain, "external-fetch", `Successfully fetched from ${name} (${size})`, "success");
          return result;
        }
      }
    }
    this.markDomainAsFailed(domain);
    // Save failure tracker periodically
    await this.domainFailureTracker.save();
    return null;
  }

  private async tryFetchLogo(
    testDomain: string,
    name: LogoSource,
    urlFn: (d: string) => string,
    size: string,
    originalDomain: string,
  ): Promise<ExternalFetchResult | null> {
    const url = urlFn(testDomain);
    try {
      if (isDebug) console.log(`[UnifiedImageService] Attempting ${name} (${size}) fetch: ${url}`);
      logoDebugger.logAttempt(originalDomain, "external-fetch", `Trying ${name} (${size}): ${url}`, "success");

      const fetchOptions = {
        headers: { ...DEFAULT_IMAGE_HEADERS, ...getBrowserHeaders() },
        timeout: name === "direct" ? 10000 : this.CONFIG.LOGO_FETCH_TIMEOUT,
      };

      // Use fetchBinary which includes proper error handling and content type detection
      const { buffer: rawBuffer, contentType: responseContentType } = await fetchBinary(url, {
        ...fetchOptions,
        validateAsLogo: true,
      });
      if (isDebug) console.log(`[UnifiedImageService] ${name} (${size}) fetched successfully for ${url}`);
      if (!rawBuffer || rawBuffer.byteLength < this.CONFIG.MIN_BUFFER_SIZE) {
        if (isDebug)
          console.log(
            `[UnifiedImageService] ${name} (${size}) buffer too small: ${rawBuffer?.byteLength || 0} bytes for ${testDomain}`,
          );
        return null;
      }

      const mockResponse = { headers: new Map([["content-type", responseContentType]]) } as unknown as Response;

      // In streaming mode for dev, skip globe detection and validation; return raw buffer
      if (this.devStreamImagesToS3) {
        console.log(`[UnifiedImageService] (dev-stream) Using raw logo for ${originalDomain} from ${name} (${size})`);
        return { buffer: rawBuffer, source: name, contentType: responseContentType, url };
      }

      if (await this.checkIfGlobeIcon(rawBuffer, url, mockResponse, testDomain, name)) return null;

      if (await this.validateLogoBuffer(rawBuffer, url)) {
        const { processedBuffer, contentType } = await this.processImageBuffer(rawBuffer);
        console.log(
          `[UnifiedImageService] Fetched logo for ${originalDomain} from ${name} (${size}) using ${testDomain}`,
        );
        return { buffer: processedBuffer, source: name, contentType, url };
      }

      if (isDebug) {
        const meta = await extractBasicImageMeta(rawBuffer);
        console.log(
          `[UnifiedImageService] ${name} (${size}) validation failed for ${testDomain}: ${meta.width}x${meta.height} (${meta.format})`,
        );
      }
    } catch (error) {
      // Direct fetches have different error patterns - be more forgiving
      if (name === "direct") {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (
          errorMessage.includes("ENOTFOUND") ||
          errorMessage.includes("ECONNREFUSED") ||
          errorMessage.includes("ETIMEDOUT") ||
          errorMessage.includes("certificate") ||
          errorMessage.includes("SSL") ||
          errorMessage.includes("404") ||
          errorMessage.includes("403")
        ) {
          if (isDebug)
            console.log(`[UnifiedImageService] Expected error for direct fetch from ${testDomain}: ${errorMessage}`);
          logoDebugger.logAttempt(originalDomain, "external-fetch", `Direct fetch failed: ${errorMessage}`, "failed");
          return null;
        }
      }

      // Use isRetryableHttpError to check if this error is worth retrying
      if (!isRetryableHttpError(error)) {
        console.warn(
          `[UnifiedImageService] Non-retryable error fetching logo for ${testDomain} from ${name} (${size}) at ${url}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      logoDebugger.logAttempt(
        originalDomain,
        "external-fetch",
        `${name} fetch error: ${error instanceof Error ? error.message : String(error)}`,
        "failed",
      );
    }
    return null;
  }

  private async checkIfGlobeIcon(
    rawBuffer: Buffer,
    url: string,
    response: Response,
    testDomain: string,
    name: LogoSource,
  ): Promise<boolean> {
    const baseUrl = getBaseUrl();
    if (!baseUrl || process.env.NEXT_PHASE?.includes("build")) return false;
    try {
      const formData = new FormData();
      const contentType =
        response.headers instanceof Map ? response.headers.get("content-type") : response.headers.get("content-type");
      formData.append(
        "image",
        new Blob([new Uint8Array(rawBuffer)], { type: contentType ?? "application/octet-stream" }),
        "logo-to-validate",
      );
      formData.append("url", url);
      const validateResponse = await fetchWithTimeout(new URL("/api/validate-logo", baseUrl).toString(), {
        method: "POST",
        body: formData,
        timeout: 5000,
      });
      if (validateResponse.ok) {
        const { isGlobeIcon } = (await validateResponse.json()) as { isGlobeIcon: boolean };
        if (isGlobeIcon) {
          if (isDebug) console.log(`[UnifiedImageService] ${name} detected as globe icon for ${testDomain}`);
          return true;
        }
      }
    } catch (validateError) {
      if (isDebug) console.log(`[UnifiedImageService] validate-logo API error for ${testDomain}:`, validateError);
    }
    return false;
  }

  private async validateLogoBuffer(buffer: Buffer, url: string): Promise<boolean> {
    // keep function asynchronous for potential future async validation
    await Promise.resolve();
    if (this.isReadOnly) return true;
    try {
      const metadata = await extractBasicImageMeta(buffer);
      return Boolean(
        metadata.width &&
          metadata.height &&
          metadata.width >= this.CONFIG.MIN_LOGO_SIZE &&
          metadata.height >= this.CONFIG.MIN_LOGO_SIZE &&
          Math.abs(metadata.width / metadata.height - 1) < this.CONFIG.ASPECT_RATIO_TOLERANCE,
      );
    } catch (error) {
      logger.error("[UnifiedImageService] Logo validation failed", error, { url });
      return false;
    }
  }

  private async processImageBuffer(
    buffer: Buffer,
  ): Promise<{ processedBuffer: Buffer; isSvg: boolean; contentType: string }> {
    return sharedProcessImageBuffer(buffer, "UnifiedImageService");
  }

  private checkAndResetSession(): void {
    if (getDeterministicTimestamp() - this.sessionStartTime > this.CONFIG.SESSION_MAX_DURATION)
      this.resetDomainSessionTracking();
  }

  private startPeriodicCleanup(): void {
    setInterval(() => this.performMemoryCleanup(), this.CONFIG.CLEANUP_INTERVAL);
  }

  private performMemoryCleanup(): void {
    const now = getDeterministicTimestamp();

    for (const [key, retry] of this.uploadRetryQueue.entries()) {
      if (now - retry.lastAttempt > 60 * 60 * 1000) this.uploadRetryQueue.delete(key);
    }

    if (this.inFlightLogoRequests.size > this.CONFIG.MAX_IN_FLIGHT_REQUESTS) {
      const entries = Array.from(this.inFlightLogoRequests.entries());
      const toKeep = entries.slice(-Math.floor(this.CONFIG.MAX_IN_FLIGHT_REQUESTS / 2));
      this.inFlightLogoRequests.clear();
      toKeep.forEach(([k, v]) => this.inFlightLogoRequests.set(k, v));
      console.warn(`[UnifiedImageService] Reduced in-flight requests from ${entries.length} to ${toKeep.length}`);
    }

    if (now - this.lastCleanupTime > this.CONFIG.CLEANUP_INTERVAL) {
      if (this.sessionFailedDomains.size > this.CONFIG.MAX_SESSION_DOMAINS) this.sessionFailedDomains.clear();

      if (this.domainRetryCount.size > this.CONFIG.MAX_SESSION_DOMAINS) {
        const entries = Array.from(this.domainRetryCount.entries());
        this.domainRetryCount.clear();
        const recentEntries = entries.slice(-Math.floor(this.CONFIG.MAX_SESSION_DOMAINS / 2));
        recentEntries.forEach(([k, v]) => this.domainRetryCount.set(k, v));
        const retryDomains = new Set(recentEntries.map(([k]) => k));
        for (const domain of this.domainFirstFailureTime.keys()) {
          if (!retryDomains.has(domain)) this.domainFirstFailureTime.delete(domain);
        }
      }

      this.lastCleanupTime = now;
      if (global.gc) {
        global.gc();
        console.log("[UnifiedImageService] Forced garbage collection after cleanup");
      }
    }
  }

  hasDomainFailedTooManyTimes(domain: string): boolean {
    this.checkAndResetSession();

    return !isOperationAllowedWithCircuitBreaker(
      "domain-failures",
      domain,
      { maxRequests: this.CONFIG.MAX_RETRIES_PER_SESSION, windowMs: this.CONFIG.SESSION_MAX_DURATION },
      { failureThreshold: this.CONFIG.PERMANENT_FAILURE_THRESHOLD, resetTimeout: this.CONFIG.SESSION_MAX_DURATION },
    );
  }

  markDomainAsFailed(domain: string): void {
    if (this.sessionFailedDomains.size >= this.CONFIG.MAX_SESSION_DOMAINS) {
      console.log(
        `[UnifiedImageService] Session domain limit reached (${this.CONFIG.MAX_SESSION_DOMAINS}), resetting session`,
      );
      this.resetDomainSessionTracking();
    }

    this.sessionFailedDomains.add(domain);
    recordOperationFailure("domain-failures", domain, {
      failureThreshold: this.CONFIG.PERMANENT_FAILURE_THRESHOLD,
      resetTimeout: this.CONFIG.SESSION_MAX_DURATION,
    });
    const currentCount = (this.domainRetryCount.get(domain) || 0) + 1;
    this.domainRetryCount.set(domain, currentCount);

    if (currentCount >= this.CONFIG.PERMANENT_FAILURE_THRESHOLD) {
      console.log(
        `[UnifiedImageService] Domain ${domain} has failed ${currentCount} times, adding to permanent blocklist`,
      );
      void this.domainFailureTracker.recordFailure(domain, `Failed ${currentCount} times across sessions`);
    }
  }

  private resetDomainSessionTracking(): void {
    this.sessionFailedDomains.clear();
    this.domainRetryCount.clear();
    this.domainFirstFailureTime.clear();
    this.sessionStartTime = getDeterministicTimestamp();
  }

  // Legacy migration methods moved to logo-hash-migrator.ts

  // Environment validation handled by s3-utils on first use

  // Domain blocklist methods are now handled by FailureTracker
}

let instance: UnifiedImageService | null = null;

/** Get singleton UnifiedImageService instance */
export function getUnifiedImageService(): UnifiedImageService {
  return (instance ||= new UnifiedImageService());
}
