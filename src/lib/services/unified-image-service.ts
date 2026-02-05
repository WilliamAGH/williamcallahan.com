/**
 * Unified image service facade - delegates to specialized modules
 * @module lib/services/unified-image-service
 */
import { checkIfS3ObjectExists } from "@/lib/s3/objects";
import { ServerCacheInstance } from "../server-cache";
import { getDeterministicTimestamp } from "../utils/deterministic-timestamp";
import { UNIFIED_IMAGE_SERVICE_CONFIG } from "../constants";
import { isS3ReadOnly } from "../utils/s3-read-only";
import type { LogoInversion } from "../../types/logo";
import type { ImageServiceOptions, ImageResult } from "../../types/image";
import { DEFAULT_IMAGE_HEADERS, fetchBinary } from "../utils/http-client";
import { inferContentTypeFromUrl, DEFAULT_IMAGE_CONTENT_TYPE } from "../utils/content-type";
import { wipeBuffer } from "../health/memory-health-monitor";
import { monitoredAsync } from "../async-operations-monitor";
import type { LogoFetchResult, LogoValidationResult } from "../../types/cache";
import { logoDebugger } from "@/lib/utils/logo-debug";
import logger from "../utils/logger";
import { LogoValidators } from "./image/logo-validators";
import { S3Operations } from "./image/s3-operations";
import { SessionManager } from "./image/session-manager";
import { LogoFetcher } from "./image/logo-fetcher";
import { findExistingHashedLogo, findAndMigrateLegacyLogo } from "./image/logo-discovery";
import {
  fetchAndPersistExternalLogo,
  buildReadOnlyMissingResult,
  buildMemoryPressureResult,
} from "./image/logo-persistence";
import { fetchAndProcessImage } from "./image/image-fetcher";

export class UnifiedImageService {
  private readonly isReadOnly = isS3ReadOnly();
  private readonly isDev = process.env.NODE_ENV !== "production";
  private readonly devProcessingDisabled =
    this.isDev &&
    (process.env.DEV_DISABLE_IMAGE_PROCESSING === "1" ||
      process.env.DEV_DISABLE_IMAGE_PROCESSING === "true");
  private readonly devStreamImagesToS3 =
    this.isDev &&
    (process.env.DEV_STREAM_IMAGES_TO_S3 === "1" || process.env.DEV_STREAM_IMAGES_TO_S3 === "true");

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
    if (
      process.env.NODE_ENV === "production" &&
      !process.env.NEXT_PUBLIC_S3_CDN_URL &&
      !process.env.S3_BUCKET
    ) {
      throw new Error(
        "UnifiedImageService: Either NEXT_PUBLIC_S3_CDN_URL or S3_BUCKET must be set in production.",
      );
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
        contentType: DEFAULT_IMAGE_CONTENT_TYPE,
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
          return {
            contentType: inferContentTypeFromUrl(url),
            source: "s3",
            cdnUrl: this.getCdnUrl(s3Key) || undefined,
          };
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
            retainBuffer && result.buffer
              ? Buffer.from(result.buffer)
              : (result.buffer ?? undefined);
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
      {
        timeoutMs: timeoutMs ?? this.CONFIG.FETCH_TIMEOUT,
        metadata: { url: safeUrlForLog, options: imageOptions },
      },
    );
  }

  /** Get logo with validation, optional inversion */
  async getLogo(domain: string, options: ImageServiceOptions = {}): Promise<LogoFetchResult> {
    if (!this.shouldAcceptRequests()) {
      return buildMemoryPressureResult(domain);
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
      () => this.executeLogoFetch(domain, options),
      { timeoutMs: this.CONFIG.FETCH_TIMEOUT, metadata: { domain, options } },
    );

    // Track in-flight request with automatic cleanup
    this.sessionMgr.setInFlightRequest(domain, requestPromise);

    return requestPromise;
  }

  /** Execute the actual logo fetch logic (separated for SRP per [MO1d]) */
  private async executeLogoFetch(
    domain: string,
    options: ImageServiceOptions,
  ): Promise<LogoFetchResult> {
    // Check server cache first
    const cachedResult = ServerCacheInstance.getLogoFetch(domain);
    if (cachedResult?.s3Key && (this.isReadOnly || !options.forceRefresh)) {
      return { ...cachedResult, cdnUrl: this.getCdnUrl(cachedResult.s3Key) || undefined };
    }

    // Build result helper bound to logoFetcher
    const buildResult = this.logoFetcher.buildLogoFetchResult.bind(this.logoFetcher);

    // Check for existing hashed logo files (extracted to logo-discovery.ts)
    const hashedLogo = await findExistingHashedLogo(domain, buildResult);
    if (hashedLogo) {
      ServerCacheInstance.setLogoFetch(domain, hashedLogo);
      return hashedLogo;
    }

    // Check for legacy logos and optionally migrate (extracted to logo-discovery.ts)
    const legacyLogo = await findAndMigrateLegacyLogo(domain, this.isReadOnly, buildResult);
    if (legacyLogo) {
      ServerCacheInstance.setLogoFetch(domain, legacyLogo);
      return legacyLogo;
    }

    // No logo found in CDN - return error in read-only mode
    if (this.isReadOnly) {
      return buildReadOnlyMissingResult(domain, this.isDev);
    }

    // Not found in S3, try external sources
    logoDebugger.logAttempt(domain, "s3-check", "No existing logo found in S3", "failed");

    // Delegate to extracted persistence logic
    return fetchAndPersistExternalLogo(domain, options, {
      isReadOnly: this.isReadOnly,
      devStreamImagesToS3: this.devStreamImagesToS3,
      validators: this.validators,
      s3Ops: this.s3Ops,
      logoFetcher: this.logoFetcher,
      getCdnUrl: (s3Key) => this.getCdnUrl(s3Key),
    });
  }

  /** Fetch and process image from URL (delegates to extracted module) */
  private fetchAndProcess(
    url: string,
    options: ImageServiceOptions,
  ): Promise<{ buffer: Buffer; contentType: string; streamedToS3?: boolean }> {
    return fetchAndProcessImage(url, options, {
      devProcessingDisabled: this.devProcessingDisabled,
      devStreamImagesToS3: this.devStreamImagesToS3,
      isDev: this.isDev,
      shouldAcceptRequests: () => this.shouldAcceptRequests(),
      s3Ops: this.s3Ops,
      logoFetcher: this.logoFetcher,
      placeholderBuffer: UnifiedImageService.TRANSPARENT_PNG_PLACEHOLDER,
      fetchTimeout: this.CONFIG.FETCH_TIMEOUT,
    });
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
