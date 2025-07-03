/**
 * Unified image service - fetching, processing, caching
 * Memory-safe operations with S3/CDN delivery
 * @module lib/services/unified-image-service
 */
import { s3Client, writeBinaryS3, readBinaryS3, checkIfS3ObjectExists } from "../s3-utils";
import { ServerCacheInstance } from "../server-cache";
import { getDomainVariants } from "../utils/domain-utils";
import { LOGO_SOURCES, LOGO_BLOCKLIST_S3_PATH } from "../constants";
import { getBaseUrl } from "../utils/get-base-url";
import { isDebug } from "../utils/debug";
import { isS3ReadOnly } from "../utils/s3-read-only";
import type { LogoSource } from "../../types/logo";
import type { ExternalFetchResult } from "../../types/image";
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
import { retryWithOptions } from "../utils/retry";
import { generateS3Key, getFileExtension } from "../utils/s3-key-generator";
import { FailureTracker } from "../utils/failure-tracker";
import { isOperationAllowedWithCircuitBreaker, recordOperationFailure } from "../rate-limiter";
import type { CircuitBreakerConfig } from "@/types/lib";
import { inferContentTypeFromUrl, getExtensionFromContentType, IMAGE_EXTENSIONS } from "../utils/content-type";
import { buildCdnUrl } from "../utils/cdn-utils";
import { isLogoUrl, extractDomain, extractTld } from "../utils/url-utils";
import { getBufferHash, getCacheKey } from "../utils/hash-utils";
import { getMemoryHealthMonitor } from "../health/memory-health-monitor";
import { migrationLock } from "../utils/async-lock";

import { monitoredAsync } from "../async-operations-monitor";
import type { LogoFetchResult, LogoValidationResult } from "../../types/cache";
import type { LogoInversion } from "../../types/logo";
import type { ImageServiceOptions, ImageResult } from "../../types/image";
import { IMAGE_S3_PATHS } from "@/lib/constants";
import { logoDebugger } from "@/lib/utils/logo-debug";

export class UnifiedImageService {
  private get cdnBaseUrl(): string {
    return process.env.S3_CDN_URL || process.env.NEXT_PUBLIC_S3_CDN_URL || "";
  }
  private get s3BucketName(): string {
    return process.env.S3_BUCKET || "";
  }
  private get s3ServerUrl(): string | undefined {
    return process.env.S3_SERVER_URL;
  }
  // Migration lock moved to centralized async-lock utility
  private readonly isReadOnly = isS3ReadOnly();
  private readonly isDev = process.env.NODE_ENV !== "production";

  // Removed sessionProcessedDomains as it was never used
  private sessionFailedDomains = new Set<string>();
  private domainRetryCount = new Map<string, number>();
  private domainFirstFailureTime = new Map<string, number>(); // Track when domain first failed
  private sessionStartTime = Date.now();
  private lastCleanupTime = Date.now();

  // Request deduplication for concurrent logo fetches
  private inFlightLogoRequests = new Map<string, Promise<LogoFetchResult>>();
  private readonly CONFIG = {
    SESSION_MAX_DURATION: 30 * 60 * 1000,
    MAX_RETRIES_PER_SESSION: 3,
    MAX_UPLOAD_RETRIES: 3,
    RETRY_BASE_DELAY: 60000, // 1 minute base delay
    RETRY_MAX_DELAY: 5 * 60 * 1000, // 5 minutes max delay
    RETRY_JITTER_FACTOR: 0.3, // 30% jitter
    PERMANENT_FAILURE_THRESHOLD: 5,
    FETCH_TIMEOUT: 30000,
    LOGO_FETCH_TIMEOUT: 5000,
    MIN_BUFFER_SIZE: 100,
    MIN_LOGO_SIZE: 16,
    ASPECT_RATIO_TOLERANCE: 2,
    // Memory safety bounds
    MAX_SESSION_DOMAINS: 500, // Reduced from 1000
    MAX_RETRY_QUEUE_SIZE: 50, // Reduced from 100
    MAX_BLOCKLIST_SIZE: 5000, // Limit blocklist size
    MAX_IN_FLIGHT_REQUESTS: 25, // Reduced from implicit 100
    MAX_MIGRATION_LOCKS: 10, // Reduced from implicit 50
    CLEANUP_INTERVAL: 2 * 60 * 1000, // Cleanup every 2 minutes (unified)
    MEMORY_CHECK_INTERVAL: 1000, // Check memory every second during operations
  };
  private uploadRetryQueue = new Map<
    string,
    { sourceUrl: string; contentType: string; attempts: number; lastAttempt: number; nextRetry: number }
  >();
  private retryTimerId: NodeJS.Timeout | null = null;

  // Use FailureTracker for domain blocklist management
  private domainFailureTracker = new FailureTracker<string>((domain) => domain, {
    s3Path: LOGO_BLOCKLIST_S3_PATH,
    maxRetries: this.CONFIG.PERMANENT_FAILURE_THRESHOLD,
    cooldownMs: 24 * 60 * 60 * 1000, // 24 hours
    maxItems: this.CONFIG.MAX_BLOCKLIST_SIZE,
    name: "UnifiedImageService-DomainTracker",
  });

  constructor() {
    // Validate environment variables if not in read-only mode
    if (!this.isReadOnly) {
      this.validateEnvironment();
    }

    // Start unified cleanup timer
    this.startPeriodicCleanup();

    // Validate CDN configuration in production
    if (process.env.NODE_ENV === "production") {
      if (!this.cdnBaseUrl && !this.s3BucketName) {
        throw new Error(
          "UnifiedImageService: Missing critical configuration. " +
            "Either S3_CDN_URL or S3_BUCKET must be set in production. " +
            "This is required for proper image delivery.",
        );
      }

      if (!this.cdnBaseUrl) {
        console.warn(
          [
            "##########################################################################################",
            "# WARNING: S3_CDN_URL is not set in a production environment.                           #",
            "# Image URLs will fall back to the S3 endpoint, which is inefficient and may be incorrect. #",
            "# Please set this environment variable to your CDN URL.                                  #",
            "##########################################################################################",
          ].join("\n"),
        );
      }
    }

    // Validate CDN URL format if provided
    if (this.cdnBaseUrl) {
      try {
        new URL(this.cdnBaseUrl);
      } catch {
        throw new Error(
          `UnifiedImageService: Invalid CDN URL format: "${this.cdnBaseUrl}". ` + "S3_CDN_URL must be a valid URL.",
        );
      }
    }
    console.log(`[UnifiedImageService] Initialized in ${this.isReadOnly ? "READ-ONLY" : "READ-WRITE"} mode`);
    this.startRetryProcessing();
    // Cleanup timer started in constructor
    void this.domainFailureTracker.load();
  }

  private logError(operation: string, error: unknown, metadata?: Record<string, unknown>): void {
    console.error(
      `[UnifiedImageService] ${operation}:`,
      error instanceof Error ? error.message : String(error),
      metadata || {},
    );
  }

  /** Fetch image with caching (memory → S3 → origin) */
  async getImage(url: string, options: ImageServiceOptions = {}): Promise<ImageResult> {
    // Check memory before starting
    const memoryMonitor = getMemoryHealthMonitor();
    if (!memoryMonitor.shouldAcceptNewRequests()) {
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
          this.cleanupBuffer(result?.buffer);
          result = null;
        }
      },
      { timeoutMs: this.CONFIG.FETCH_TIMEOUT, metadata: { url, options } },
    );
  }

  /** Get logo with validation, optional inversion */
  async getLogo(domain: string, options: ImageServiceOptions = {}): Promise<LogoFetchResult> {
    // Check memory before starting
    const memoryMonitor = getMemoryHealthMonitor();
    if (!memoryMonitor.shouldAcceptNewRequests()) {
      return {
        domain,
        source: null,
        contentType: "image/png",
        error: "Insufficient memory to process logo request",
        timestamp: Date.now(),
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
        if (this.isReadOnly) {
          if (this.isDev) {
            console.info(`[UnifiedImageService] Read-only miss for logo domain '${domain}'`);
          }
          return {
            domain,
            source: null,
            contentType: "image/png",
            error: "Logo not available in read-only mode",
            timestamp: Date.now(),
            isValid: false,
          };
        }

        // 🔍 S3 Pre-flight check: Use efficient prefix search to find existing logos
        const hasS3Client = !!s3Client.send;
        if (hasS3Client && this.s3BucketName && !this.isReadOnly) {
          const { name: domainNameWithDots, tld } = extractTld(domain);
          const domainName = domainNameWithDots.replace(/\./g, "_");
          const tldName = tld.replace(/\./g, "_");
          const s3KeyPrefix = `${IMAGE_S3_PATHS.LOGOS_DIR}/${domainName}_${tldName}_`;

          try {
            console.log(`[UnifiedImageService] Checking S3 for existing logos with prefix: ${s3KeyPrefix}`);
            const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
            const listCommand = new ListObjectsV2Command({
              Bucket: this.s3BucketName,
              Prefix: s3KeyPrefix,
              MaxKeys: 10,
            });

            const listResult = await s3Client.send(listCommand);

            if (listResult.Contents && listResult.Contents.length > 0) {
              // Found existing logo(s) - use the first one
              const firstObject = listResult.Contents[0];
              if (firstObject?.Key) {
                const existingKey = firstObject.Key;
                console.log(`[UnifiedImageService] Found existing logo: ${existingKey}`);

                // Use the parseS3Key utility to extract metadata
                const { parseS3Key } = await import("@/lib/utils/s3-key-generator");
                const parsed = parseS3Key(existingKey);

                if (parsed.type === "logo" && parsed.domain && parsed.source) {
                  const source = parsed.source as LogoSource;
                  const ext = parsed.extension || "png";
                  const contentType = ext === "svg" ? "image/svg+xml" : ext === "ico" ? "image/x-icon" : `image/${ext}`;

                  // Check if this is a legacy file (no hash) that needs migration
                  if (!parsed.hash && !this.isReadOnly) {
                    console.log(`[UnifiedImageService] Found legacy/manual upload file without hash: ${existingKey}`);
                    // Launch async migration (fire-and-forget)
                    const migrationKey = `${domain}-${source}`;
                    migrationLock
                      .acquire(migrationKey, async () => {
                        console.log(`[UnifiedImageService] Async migration starting for ${existingKey}`);
                        return this.performLegacyMigration(existingKey, ext, contentType, source, domain);
                      })
                      .then(() => {
                        console.log(`[UnifiedImageService] Async migration completed for ${existingKey}`);
                      })
                      .catch((migrationErr) => {
                        console.error(`[UnifiedImageService] Async migration failed for ${existingKey}:`, migrationErr);
                      });
                  }

                  const cachedResult: LogoFetchResult = {
                    domain,
                    s3Key: existingKey,
                    cdnUrl: this.getCdnUrl(existingKey),
                    url: undefined,
                    source,
                    contentType,
                    timestamp: Date.now(),
                    isValid: true,
                  } as LogoFetchResult;

                  // writeBinaryS3 already handles public-read ACL - no additional ACL fixing needed

                  ServerCacheInstance.setLogoFetch(domain, cachedResult);
                  return cachedResult;
                }
              }
            } else {
              console.log(`[UnifiedImageService] No existing logos found for ${domain}`);
            }
          } catch (s3Error) {
            console.warn(`[UnifiedImageService] S3 prefix search failed for ${domain}:`, s3Error);
          }
        }

        // Not found in S3, try external sources
        logoDebugger.logAttempt(domain, "s3-check", "No existing logo found in S3", "failed");

        try {
          const logoData = await this.fetchExternalLogo(domain);
          if (!logoData?.buffer) {
            logoDebugger.logAttempt(domain, "external-fetch", "All external sources failed", "failed");
            throw new Error("No logo found");
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
            timestamp: Date.now(),
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
            timestamp: Date.now(),
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

    // Store the in-flight request with bounds checking
    if (this.inFlightLogoRequests.size >= this.CONFIG.MAX_IN_FLIGHT_REQUESTS) {
      // Remove oldest entry to make room
      const firstKey = this.inFlightLogoRequests.keys().next().value;
      if (firstKey) {
        this.inFlightLogoRequests.delete(firstKey);
      }
    }
    this.inFlightLogoRequests.set(domain, requestPromise);

    // Clean up after completion (success or failure)
    requestPromise
      .finally(() => {
        // Clean up in-flight request after a short delay to handle concurrent requests
        setTimeout(() => {
          this.inFlightLogoRequests.delete(domain);
        }, 100);
      })
      .catch(() => {
        // Silently catch to prevent unhandled rejection
      });

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
      this.logError("Failed to invert logo", error, { domain });
      return {};
    }
  }

  private async fetchAndProcess(
    url: string,
    options: ImageServiceOptions,
  ): Promise<{ buffer: Buffer; contentType: string; streamedToS3?: boolean }> {
    // Check memory before fetching
    const memoryMonitor = getMemoryHealthMonitor();
    if (!memoryMonitor.shouldAcceptNewRequests()) {
      throw new Error("Insufficient memory to fetch image");
    }

    if (this.isLogoUrl(url)) {
      const logoResult = await this.fetchExternalLogo(this.extractDomain(url));
      if (!logoResult?.buffer) throw new Error("Failed to fetch logo");
      const result = { buffer: logoResult.buffer, contentType: logoResult.contentType || "image/png" };

      // Clear the source buffer after copying
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
      const contentLength = response.headers.get("content-length");
      const { shouldStreamImage, streamToS3, getContentTypeFromResponse } = await import("./image-streaming");
      if (shouldStreamImage(contentLength) && response.body) {
        const s3Key = this.generateS3Key(url, options);
        const streamResult = await streamToS3(response.body, {
          bucket: this.s3BucketName,
          key: s3Key,
          contentType: getContentTypeFromResponse(response),
          s3Client: s3Client,
        });
        if (streamResult.success) {
          console.log(`[UnifiedImageService] Streamed ${streamResult.bytesStreamed} bytes directly to S3: ${s3Key}`);
          return {
            buffer: Buffer.alloc(0),
            contentType: contentType || "application/octet-stream",
            streamedToS3: true,
          };
        } else {
          console.warn(`[UnifiedImageService] Stream to S3 failed, falling back to memory loading`);
        }
      }

      // Check memory again before loading into buffer
      if (!memoryMonitor.shouldAcceptNewRequests()) {
        throw new Error("Insufficient memory to load image into buffer");
      }

      const arrayBuffer = await response.arrayBuffer();
      let buffer = Buffer.from(arrayBuffer);

      try {
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
      this.logError("S3 upload failed", error);
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
          const baseDelay = Math.min(this.CONFIG.RETRY_BASE_DELAY * 2 ** (attempts - 1), this.CONFIG.RETRY_MAX_DELAY);
          const jitter = Math.random() * baseDelay * this.CONFIG.RETRY_JITTER_FACTOR;
          const delay = Math.round(baseDelay + jitter);
          const nextRetry = Date.now() + delay;
          this.uploadRetryQueue.set(key, { sourceUrl, contentType, attempts, lastAttempt: Date.now(), nextRetry });
          console.log(
            `[UnifiedImageService] S3 upload failed due to memory pressure. Retry ${attempts}/${this.CONFIG.MAX_UPLOAD_RETRIES} scheduled for ${new Date(nextRetry).toISOString()}`,
          );
        } else {
          this.logError(
            `S3 upload failed after ${this.CONFIG.MAX_UPLOAD_RETRIES} attempts`,
            new Error("Max retries exceeded"),
            { key },
          );
          this.uploadRetryQueue.delete(key);
        }
      }
    } else {
      this.logError("S3 upload failed", error, { key, contentType, bufferSize: buffer.byteLength });
    }
  }

  private generateCacheKey(url: string, options: ImageServiceOptions): string {
    return getCacheKey([
      url,
      options.invertColors && "inverted",
      options.maxSize && `size:${options.maxSize}`,
      options.quality && `q:${options.quality}`,
    ]);
  }

  private extractSourceUrlFromKey(s3Key: string): string | null {
    if (!s3Key.includes("/logos/") && !s3Key.includes("/logo/")) return null;
    const filename = s3Key.split("/").pop()?.split(".")[0];
    if (!filename?.includes("_")) return null;
    const [company] = filename.split("_");
    if (!company) return null;
    const domainMap: Record<string, string> = {
      morningstar: "morningstar.com",
      tsbank: "tsbank.com",
      mutualfirst: "mutualfirst.com",
      seekinvest: "seekinvest.com",
      stanford: "stanford.edu",
      columbia: "columbia.edu",
      creighton: "creighton.edu",
      unomaha: "unomaha.edu",
      cfp: "cfp.net",
    };
    return domainMap[company] ?? null;
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
    const now = Date.now();
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
            isRetryable: (error) => isRetryableHttpError(error),
            onRetry: (_error, attempt) => {
              console.log(
                `[UnifiedImageService] Retry ${attempt + retry.attempts}/${this.CONFIG.MAX_UPLOAD_RETRIES} for ${key}`,
              );
            },
          },
        )
          .then((result) => {
            if (result?.cdnUrl) {
              this.uploadRetryQueue.delete(key);
              console.log(`[UnifiedImageService] Retry successful for ${key}`);
            }
          })
          .catch((error) => {
            this.logError("All retries failed", error, { key });
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
      cdnBaseUrl: this.cdnBaseUrl,
      s3BucketName: this.s3BucketName,
      s3ServerUrl: this.s3ServerUrl,
    });
  }

  private isLogoUrl(url: string): boolean {
    return isLogoUrl(url);
  }

  private extractDomain(url: string): string {
    return extractDomain(url);
  }

  private getFileExtension(url: string): string | null {
    const ext = getFileExtension(url);
    return ext ? `.${ext}` : null;
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
      this.logError("Failed to analyze logo from URL", error, { url });
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
      return { isGlobeIcon: true, timestamp: Date.now() };
    }

    // Import analysis functions
    const { isBlankOrPlaceholder } = await import("@/lib/image-handling/image-analysis");
    const blankCheck = await isBlankOrPlaceholder(buffer);

    const isGlobeIcon = blankCheck.isBlank || blankCheck.isGlobe;
    ServerCacheInstance.setLogoValidation(bufferHash, isGlobeIcon);
    return { isGlobeIcon, timestamp: Date.now() };
  }

  /** Analyze logo brightness, inversion needs */
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

      // Filter out sources with undefined urlFn
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

      // Special handling for direct favicon fetches - more lenient error handling
      const fetchOptions = {
        headers: {
          ...DEFAULT_IMAGE_HEADERS,
          ...getBrowserHeaders(),
        },
        timeout: name === "direct" ? 10000 : this.CONFIG.LOGO_FETCH_TIMEOUT, // Longer timeout for direct fetches
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

      // Create a minimal response object for checkIfGlobeIcon compatibility
      const mockResponse = {
        headers: new Map([["content-type", responseContentType]]),
      } as unknown as Response;

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
        // Common direct fetch errors that shouldn't be treated as permanent failures
        if (
          errorMessage.includes("ENOTFOUND") ||
          errorMessage.includes("ECONNREFUSED") ||
          errorMessage.includes("ETIMEDOUT") ||
          errorMessage.includes("certificate") ||
          errorMessage.includes("SSL") ||
          errorMessage.includes("404") ||
          errorMessage.includes("403")
        ) {
          if (isDebug) {
            console.log(`[UnifiedImageService] Expected error for direct fetch from ${testDomain}: ${errorMessage}`);
          }
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
        new Blob([rawBuffer], { type: contentType ?? "application/octet-stream" }),
        "logo-to-validate",
      );
      formData.append("url", url);
      const validateResponse = await fetchWithTimeout(new URL("/api/validate-logo", baseUrl).toString(), {
        method: "POST",
        body: formData,
        timeout: 5000, // Quick timeout for internal API call
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
      this.logError("Logo validation failed", error, { url });
      return false;
    }
  }

  private async processImageBuffer(
    buffer: Buffer,
  ): Promise<{ processedBuffer: Buffer; isSvg: boolean; contentType: string }> {
    return sharedProcessImageBuffer(buffer, "UnifiedImageService");
  }

  private checkAndResetSession(): void {
    if (Date.now() - this.sessionStartTime > this.CONFIG.SESSION_MAX_DURATION) this.resetDomainSessionTracking();
  }

  private startPeriodicCleanup(): void {
    // Run unified cleanup on configured interval
    setInterval(() => {
      this.performMemoryCleanup();
    }, this.CONFIG.CLEANUP_INTERVAL);
  }

  private performMemoryCleanup(): void {
    const now = Date.now();

    // Clean up old retry queue entries
    for (const [key, retry] of this.uploadRetryQueue.entries()) {
      // Remove entries older than 1 hour
      if (now - retry.lastAttempt > 60 * 60 * 1000) {
        this.uploadRetryQueue.delete(key);
      }
    }

    // Clean up stale in-flight requests with lower threshold
    if (this.inFlightLogoRequests.size > this.CONFIG.MAX_IN_FLIGHT_REQUESTS) {
      // Keep only the most recent requests
      const entries = Array.from(this.inFlightLogoRequests.entries());
      const toKeep = entries.slice(-Math.floor(this.CONFIG.MAX_IN_FLIGHT_REQUESTS / 2));
      this.inFlightLogoRequests.clear();
      toKeep.forEach(([k, v]) => this.inFlightLogoRequests.set(k, v));
      console.warn(`[UnifiedImageService] Reduced in-flight requests from ${entries.length} to ${toKeep.length}`);
    }

    // Migration locks now handled by centralized async-lock utility
    // No need for manual cleanup here

    // Clean up session tracking if needed
    if (now - this.lastCleanupTime > this.CONFIG.CLEANUP_INTERVAL) {
      // Remove sessionProcessedDomains as it's never used
      // Keeping sessionFailedDomains which is actively used
      if (this.sessionFailedDomains.size > this.CONFIG.MAX_SESSION_DOMAINS) {
        this.sessionFailedDomains.clear();
      }

      // Clear old retry counts
      if (this.domainRetryCount.size > this.CONFIG.MAX_SESSION_DOMAINS) {
        // Keep only recent entries
        const entries = Array.from(this.domainRetryCount.entries());
        this.domainRetryCount.clear();
        // Keep last 50% of entries with their failure times
        const recentEntries = entries.slice(-Math.floor(this.CONFIG.MAX_SESSION_DOMAINS / 2));
        recentEntries.forEach(([k, v]) => {
          this.domainRetryCount.set(k, v);
        });

        // Clean up orphaned failure times
        const retryDomains = new Set(recentEntries.map(([k]) => k));
        for (const domain of this.domainFirstFailureTime.keys()) {
          if (!retryDomains.has(domain)) {
            this.domainFirstFailureTime.delete(domain);
          }
        }
      }

      this.lastCleanupTime = now;

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        console.log("[UnifiedImageService] Forced garbage collection after cleanup");
      }
    }
  }

  hasDomainFailedTooManyTimes(domain: string): boolean {
    this.checkAndResetSession();

    // Use enhanced rate limiter with circuit breaker
    const rateLimitConfig = {
      maxRequests: this.CONFIG.MAX_RETRIES_PER_SESSION,
      windowMs: this.CONFIG.SESSION_MAX_DURATION,
    };

    const circuitConfig: CircuitBreakerConfig = {
      failureThreshold: this.CONFIG.PERMANENT_FAILURE_THRESHOLD,
      resetTimeout: this.CONFIG.SESSION_MAX_DURATION,
    };

    // Check if domain is rate limited or circuit is open
    return !isOperationAllowedWithCircuitBreaker("domain-failures", domain, rateLimitConfig, circuitConfig);
  }

  markDomainAsFailed(domain: string): void {
    // Enforce bounds on session domains
    if (this.sessionFailedDomains.size >= this.CONFIG.MAX_SESSION_DOMAINS) {
      // Reset session when limit reached
      console.log(
        `[UnifiedImageService] Session domain limit reached (${this.CONFIG.MAX_SESSION_DOMAINS}), resetting session`,
      );
      this.resetDomainSessionTracking();
    }

    this.sessionFailedDomains.add(domain);

    // Record failure in rate limiter with circuit breaker
    const circuitConfig: CircuitBreakerConfig = {
      failureThreshold: this.CONFIG.PERMANENT_FAILURE_THRESHOLD,
      resetTimeout: this.CONFIG.SESSION_MAX_DURATION,
    };

    recordOperationFailure("domain-failures", domain, circuitConfig);

    // Check if we should add to permanent blocklist
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
    this.sessionStartTime = Date.now();
  }

  private async performLegacyMigration(
    oldS3Key: string,
    ext: string,
    contentType: string,
    source: LogoSource,
    domain: string,
  ): Promise<string | null> {
    try {
      const legacyBuffer = await readBinaryS3(oldS3Key);
      if (!legacyBuffer) {
        console.warn(`[_LogoMigrator] No content found for legacy logo ${oldS3Key}`);
        return null;
      }

      const newS3Key = generateS3Key({
        type: "logo",
        domain,
        source,
        url: `https://${domain}/logo.${ext}`, // Dummy URL for hash generation
        extension: ext,
      });

      // Check if target already exists
      if (await checkIfS3ObjectExists(newS3Key)) {
        // Target exists, just delete the legacy file
        console.log(`[_LogoMigrator] Target already exists, removing duplicate ${oldS3Key}`);
        await this.deleteLegacyFile(oldS3Key);
        return newS3Key;
      }

      // Perform migration with public-read ACL
      await writeBinaryS3(newS3Key, legacyBuffer, contentType);
      console.log(`[_LogoMigrator] Migrated legacy logo ${oldS3Key} -> ${newS3Key} (${legacyBuffer.length} bytes)`);

      // Verify the new file exists before deleting old one
      if (await checkIfS3ObjectExists(newS3Key)) {
        await this.deleteLegacyFile(oldS3Key);
        return newS3Key;
      } else {
        throw new Error(`Migration verification failed: new file not found at ${newS3Key}`);
      }
    } catch (err) {
      console.error(`[_LogoMigrator] Failed to migrate legacy logo ${oldS3Key}:`, err);
      return null;
    }
  }

  private async deleteLegacyFile(s3Key: string): Promise<void> {
    try {
      const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.s3BucketName,
          Key: s3Key,
        }),
      );
      console.log(`[_LogoMigrator] Deleted legacy file ${s3Key}`);
    } catch (deleteErr) {
      // Log but don't throw - deletion failure isn't critical
      console.warn(`[_LogoMigrator] Failed to delete legacy file ${s3Key}:`, deleteErr);
    }
  }

  private cleanupBuffer(buffer: Buffer | null | undefined): void {
    if (buffer && Buffer.isBuffer(buffer)) {
      // Zero out the buffer to help with sensitive data
      buffer.fill(0);
      // Node.js will GC the buffer when no references remain
    }
  }

  private validateEnvironment(): void {
    const required = ["S3_BUCKET", "S3_SERVER_URL", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"];
    const missing = required.filter((key) => !process.env[key]);

    if (missing.length > 0) {
      throw new Error(
        `UnifiedImageService: Missing required environment variables: ${missing.join(", ")}. ` +
          `These are required for S3 operations. Please ensure they are set in your environment.`,
      );
    }

    // Validate S3 server URL format
    if (this.s3ServerUrl) {
      try {
        new URL(this.s3ServerUrl);
      } catch {
        throw new Error(
          `UnifiedImageService: Invalid S3_SERVER_URL format: "${this.s3ServerUrl}". ` +
            "S3_SERVER_URL must be a valid URL.",
        );
      }
    }

    // Optionally validate S3 access (non-blocking)
    this.validateS3Access().catch((error) => {
      console.error("[UnifiedImageService] S3 access validation failed:", error);
    });
  }

  private async validateS3Access(): Promise<void> {
    try {
      // Try to list objects with a limit of 1 to test credentials
      const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
      await s3Client.send(
        new ListObjectsV2Command({
          Bucket: this.s3BucketName,
          MaxKeys: 1,
          Prefix: "images/logos/",
        }),
      );
      console.log("[UnifiedImageService] S3 access validated successfully");
    } catch (error) {
      // Don't throw here - just log the warning
      console.warn("[UnifiedImageService] S3 access validation failed. Check credentials:", error);
    }
  }

  // Domain blocklist methods are now handled by FailureTracker
}

let instance: UnifiedImageService | null = null;

/** Get singleton UnifiedImageService instance */
export function getUnifiedImageService(): UnifiedImageService {
  return (instance ||= new UnifiedImageService());
}
