/**
 * Unified image service facade - delegates to specialized modules
 * @module lib/services/unified-image-service
 */
import { s3Client, checkIfS3ObjectExists } from "../s3-utils";
import { ServerCacheInstance, getDeterministicTimestamp } from "../server-cache";
import { parseS3Key, generateS3Key, hashAndArchiveManualLogo } from "../utils/hash-utils";
import { UNIFIED_IMAGE_SERVICE_CONFIG } from "../constants";
import { isS3ReadOnly } from "../utils/s3-read-only";
import type { LogoSource, LogoInversion } from "../../types/logo";
import type { ImageServiceOptions, ImageResult } from "../../types/image";
import { fetchWithTimeout, DEFAULT_IMAGE_HEADERS, fetchBinary } from "../utils/http-client";
import { safeStringifyValue } from "../utils/error-utils";
import { inferContentTypeFromUrl, getContentTypeFromExtension } from "../utils/content-type";
import { isLogoUrl, extractDomain } from "../utils/url-utils";
import { getMemoryHealthMonitor, wipeBuffer } from "../health/memory-health-monitor";
import { monitoredAsync } from "../async-operations-monitor";
import type { LogoFetchResult, LogoValidationResult } from "../../types/cache";
import { logoDebugger } from "@/lib/utils/logo-debug";
import { maybeStreamImageToS3 } from "./image-streaming";
import logger from "../utils/logger";
import { LogoValidators } from "./image/logo-validators";
import { S3Operations } from "./image/s3-operations";
import { SessionManager } from "./image/session-manager";
import { LogoFetcher } from "./image/logo-fetcher";

export class UnifiedImageService {
  private readonly isReadOnly = isS3ReadOnly();
  private readonly isDev = process.env.NODE_ENV !== "production";
  private readonly devProcessingDisabled =
    this.isDev &&
    (process.env.DEV_DISABLE_IMAGE_PROCESSING === "1" || process.env.DEV_DISABLE_IMAGE_PROCESSING === "true");
  private readonly devStreamImagesToS3 =
    this.isDev && (process.env.DEV_STREAM_IMAGES_TO_S3 === "1" || process.env.DEV_STREAM_IMAGES_TO_S3 === "true");

  /** 1x1 transparent PNG placeholder - used when image processing is disabled */
  private static readonly TRANSPARENT_PNG_PLACEHOLDER = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO3GdQAAAABJRU5ErkJggg==",
    "base64",
  );

  private readonly CONFIG = UNIFIED_IMAGE_SERVICE_CONFIG;

  // Specialist modules (composition over inheritance)
  private readonly validators: LogoValidators;
  private readonly s3Ops: S3Operations;
  private readonly sessionMgr: SessionManager;
  private readonly logoFetcher: LogoFetcher;

  constructor() {
    // S3 utils already validate environment on first use
    if (process.env.NODE_ENV === "production" && !process.env.S3_CDN_URL && !process.env.S3_BUCKET) {
      throw new Error("UnifiedImageService: Either S3_CDN_URL or S3_BUCKET must be set in production.");
    }

    // Initialize specialist modules
    this.validators = new LogoValidators(this.isReadOnly);
    this.s3Ops = new S3Operations(this.isReadOnly);
    this.sessionMgr = new SessionManager(this.devStreamImagesToS3);
    this.logoFetcher = new LogoFetcher(
      this.isReadOnly,
      this.devStreamImagesToS3,
      this.validators,
      this.s3Ops,
      this.sessionMgr,
    );

    // Wire up circular dependency: S3Operations needs getLogo for retries
    this.s3Ops.setLogoFetcher(async (domain: string) => {
      const result = await this.getLogo(domain);
      return { cdnUrl: result.cdnUrl, error: result.error };
    });

    logger.info(`Initialized in ${this.isReadOnly ? "READ-ONLY" : "READ-WRITE"} mode`, {
      service: "UnifiedImageService",
    });
  }

  /**
   * Check if service should accept new requests based on memory health
   */
  private shouldAcceptRequests(): boolean {
    return this.sessionMgr.shouldAcceptRequests();
  }

  /**
   * Strip query parameters and hash from URL for safe logging
   */
  private stripQueryAndHash(url: string): string {
    try {
      const parsed = new URL(url);
      parsed.search = "";
      parsed.hash = "";
      return parsed.toString();
    } catch {
      const noQuery = url.split("?")[0] ?? url;
      return noQuery.split("#")[0] ?? noQuery;
    }
  }

  /** Fetch image with caching (memory → S3 → origin) */
  async getImage(url: string, options: ImageServiceOptions = {}): Promise<ImageResult> {
    const { retainBuffer, timeoutMs, ...imageOptions } = options;
    const safeUrlForLog = this.stripQueryAndHash(url);

    // Prefer streaming-to-S3 behavior over full processing in development when requested
    if (!this.devStreamImagesToS3 && this.devProcessingDisabled) {
      return {
        buffer: UnifiedImageService.TRANSPARENT_PNG_PLACEHOLDER,
        contentType: "image/png",
        source: "placeholder",
        timestamp: getDeterministicTimestamp(),
      };
    }

    if (!this.shouldAcceptRequests()) {
      throw new Error("Insufficient memory to process image request");
    }
    return monitoredAsync(
      null,
      `get-image-${safeUrlForLog}`,
      async () => {
        const s3Key = this.s3Ops.generateS3Key(url, imageOptions);
        if (!imageOptions.forceRefresh && (await checkIfS3ObjectExists(s3Key))) {
          return { contentType: inferContentTypeFromUrl(url), source: "s3", cdnUrl: this.getCdnUrl(s3Key) };
        }
        if (this.isReadOnly && !imageOptions.skipUpload) {
          throw new Error(`Image not available in read-only mode: ${safeUrlForLog}`);
        }

        let result: { buffer: Buffer; contentType: string; streamedToS3?: boolean } | null = null;
        try {
          result = await this.fetchAndProcess(url, imageOptions);
          if (!imageOptions.skipUpload && !result.streamedToS3 && !this.isReadOnly) {
            await this.s3Ops.uploadToS3(s3Key, result.buffer, result.contentType);
          }
          const bufferForReturn =
            retainBuffer && result.buffer ? Buffer.from(result.buffer) : (result.buffer ?? undefined);
          return {
            buffer: bufferForReturn,
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
      { timeoutMs: timeoutMs ?? this.CONFIG.FETCH_TIMEOUT, metadata: { url: safeUrlForLog, options: imageOptions } },
    );
  }

  /** Get logo with validation, optional inversion */
  async getLogo(domain: string, options: ImageServiceOptions = {}): Promise<LogoFetchResult> {
    // Check memory before starting (relaxed when streaming mode is enabled in dev)
    if (!this.shouldAcceptRequests()) {
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
    const existingRequest = this.sessionMgr.getInFlightRequest(domain);
    if (existingRequest && !options.forceRefresh) {
      logger.info(`[UnifiedImageService] Reusing in-flight request for domain: ${domain}`);
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

        // First check for existing hashed logo files using deterministic key generation
        const { checkIfS3ObjectExists } = await import("@/lib/s3-utils");

        for (const source of ["direct", "google", "duckduckgo", "clearbit"] as LogoSource[]) {
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
                logger.info(`[UnifiedImageService] Found existing hashed logo: ${hashedKey}`);
                const cachedResult = this.logoFetcher.buildLogoFetchResult(domain, {
                  s3Key: hashedKey,
                  source,
                  contentType: getContentTypeFromExtension(extension),
                  isValid: true,
                });
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
          logger.info(`[UnifiedImageService] Found existing legacy logo: ${legacyKey}`);

          // Extract metadata from key
          const parsed = parseS3Key(legacyKey);
          const source = parsed.source as LogoSource;
          const ext = parsed.extension || "png";
          const contentType = getContentTypeFromExtension(ext);

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
              logger.info(`[UnifiedImageService] Manual logo migrated → ${migrated}`);
            }
          }

          const cachedResult = this.logoFetcher.buildLogoFetchResult(domain, {
            s3Key: finalKey,
            source,
            contentType,
            isValid: true,
          });
          ServerCacheInstance.setLogoFetch(domain, cachedResult);
          return cachedResult;
        }

        // No logo found in CDN - return error in read-only mode
        if (this.isReadOnly) {
          if (this.isDev) {
            logger.info(`[UnifiedImageService] Read-only: logo not found in CDN for domain '${domain}'`);
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
          const logoData = await this.logoFetcher.fetchExternalLogo(domain);
          if (!logoData?.buffer) {
            logoDebugger.logAttempt(domain, "external-fetch", "All external sources failed", "failed");
            throw new Error("No logo found");
          }

          // In streaming mode for dev: skip heavy validation/inversion and persist the original buffer
          if (this.devStreamImagesToS3) {
            const ext = this.logoFetcher.getLogoExtension(logoData.contentType);
            const s3KeyStreaming = this.logoFetcher.generateLogoS3Key(domain, logoData.source, {
              url: logoData.url,
              extension: ext,
            });
            if (!this.isReadOnly)
              await this.s3Ops.uploadToS3(s3KeyStreaming, logoData.buffer, logoData.contentType || "image/png");
            const streamingResult = this.logoFetcher.buildLogoFetchResult(domain, {
              s3Key: s3KeyStreaming,
              url: logoData.url,
              source: logoData.source,
              contentType: logoData.contentType ?? undefined,
              isValid: true,
            });
            return this.logoFetcher.finalizeLogoResult(streamingResult);
          }

          const validation = await this.validators.validateLogo(logoData.buffer);
          const isValid = !validation.isGlobeIcon;
          let finalBuffer = logoData.buffer;
          const ext = this.logoFetcher.getLogoExtension(logoData.contentType);

          // Start with base S3 key (non-inverted)
          let s3Key = this.logoFetcher.generateLogoS3Key(domain, logoData.source, {
            url: logoData.url,
            extension: ext,
          });

          // Attempt inversion if requested and logo is valid
          if (isValid && options.invertColors) {
            const inverted = await this.logoFetcher.invertLogo(logoData.buffer, domain);
            if (inverted.buffer) {
              finalBuffer = inverted.buffer;
              s3Key = this.logoFetcher.generateLogoS3Key(domain, logoData.source, {
                url: logoData.url,
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
            }
          }

          if (!this.isReadOnly) await this.s3Ops.uploadToS3(s3Key, finalBuffer, logoData.contentType || "image/png");
          const result = this.logoFetcher.buildLogoFetchResult(domain, {
            s3Key,
            url: logoData.url,
            source: logoData.source,
            contentType: logoData.contentType ?? undefined,
            isValid,
            isGlobeIcon: validation.isGlobeIcon,
          });
          return this.logoFetcher.finalizeLogoResult(result);
        } catch (error) {
          const errorResult = this.logoFetcher.buildLogoFetchResult(domain, {
            source: null,
            error: safeStringifyValue(error),
          });
          return this.logoFetcher.finalizeLogoResult(errorResult);
        }
      },
      { timeoutMs: this.CONFIG.FETCH_TIMEOUT, metadata: { domain, options } },
    );

    // Track in-flight request with automatic cleanup
    this.sessionMgr.setInFlightRequest(domain, requestPromise);

    return requestPromise;
  }

  private async fetchAndProcess(
    url: string,
    options: ImageServiceOptions,
  ): Promise<{ buffer: Buffer; contentType: string; streamedToS3?: boolean }> {
    const fetchTimeout = options.timeoutMs ?? this.CONFIG.FETCH_TIMEOUT;
    // Dev gating: skip fetch/processing entirely when disabled in development
    if (this.devProcessingDisabled && !this.devStreamImagesToS3) {
      return { buffer: UnifiedImageService.TRANSPARENT_PNG_PLACEHOLDER, contentType: "image/png" };
    }

    // Check memory before fetching unless we are in streaming mode (streaming uses bounded memory)
    if (!this.shouldAcceptRequests()) {
      throw new Error("Insufficient memory to fetch image");
    }

    if (isLogoUrl(url)) {
      const logoResult = await this.logoFetcher.fetchExternalLogo(extractDomain(url));
      if (!logoResult?.buffer) throw new Error("Failed to fetch logo");
      const result = { buffer: logoResult.buffer, contentType: logoResult.contentType || "image/png" };
      logoResult.buffer = Buffer.alloc(0);
      return result;
    }

    const response = await fetchWithTimeout(url, {
      headers: DEFAULT_IMAGE_HEADERS,
      timeout: fetchTimeout,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    const contentType = response.headers.get("content-type");
    if (!contentType?.startsWith("image/")) throw new Error("Response is not an image");

    try {
      const s3Key = this.s3Ops.generateS3Key(url, options);
      if (!options.skipUpload) {
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
      }

      // If streaming failed and we're in streaming mode, only fall back to buffering if memory allows
      if (this.devStreamImagesToS3 && !getMemoryHealthMonitor().shouldAcceptNewRequests()) {
        throw new Error("Streaming required but unavailable under memory pressure");
      }

      // Check memory again before loading into buffer
      if (!this.shouldAcceptRequests()) {
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
          const processed = await this.validators.processImageBuffer(buffer);
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

  /** Get CDN URL for S3 key */
  getCdnUrl(s3Key: string): string {
    return this.s3Ops.getCdnUrl(s3Key);
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
      return await this.validators.analyzeLogo(buffer, url);
    } catch (error) {
      logger.error("[UnifiedImageService] Failed to analyze logo from URL", error, { url });
      return null;
    }
  }

  /** Validate logo buffer, check for globe icon */
  async validateLogo(buffer: Buffer): Promise<LogoValidationResult> {
    return this.validators.validateLogo(buffer);
  }

  /** Check if domain has failed too many times */
  hasDomainFailedTooManyTimes(domain: string): boolean {
    return this.sessionMgr.hasDomainFailedTooManyTimes(domain);
  }

  /** Mark domain as failed */
  markDomainAsFailed(domain: string): void {
    this.sessionMgr.markDomainAsFailed(domain);
  }
}

let instance: UnifiedImageService | null = null;

/** Get singleton UnifiedImageService instance */
export function getUnifiedImageService(): UnifiedImageService {
  return (instance ||= new UnifiedImageService());
}
