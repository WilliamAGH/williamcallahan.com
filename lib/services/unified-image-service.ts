/**
 * Unified image service - fetching, processing, caching
 * Memory-safe operations with S3/CDN delivery
 * @module lib/services/unified-image-service
 */
import { s3Client, writeBinaryS3 } from "../s3-utils";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
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
import { detectImageContentType, inferContentTypeFromUrl } from "../utils/content-type";
import { buildCdnUrl } from "../utils/cdn-utils";
import { isLogoUrl, extractDomain } from "../utils/url-utils";
import { getBufferHash, getCacheKey } from "../utils/hash-utils";
import { getMemoryHealthMonitor } from "../health/memory-health-monitor";

import { monitoredAsync } from "../async-operations-monitor";
import type { LogoFetchResult, LogoValidationResult } from "../../types/cache";
import type { LogoInversion } from "../../types/logo";
import type { ImageServiceOptions, ImageResult } from "../../types/image";
import { IMAGE_S3_PATHS } from "@/lib/constants";

export class UnifiedImageService {
  private readonly cdnBaseUrl = process.env.NEXT_PUBLIC_S3_CDN_URL || "";
  private readonly s3BucketName = process.env.S3_BUCKET || "";
  private readonly s3ServerUrl = process.env.S3_SERVER_URL;
  private readonly isReadOnly = isS3ReadOnly();
  private readonly isDev = process.env.NODE_ENV !== "production";

  private sessionProcessedDomains = new Set<string>();
  private sessionFailedDomains = new Set<string>();
  private domainRetryCount = new Map<string, number>();
  private sessionStartTime = Date.now();
  private lastCleanupTime = Date.now();
  private readonly CONFIG = {
    SESSION_MAX_DURATION: 30 * 60 * 1000,
    MAX_RETRIES_PER_SESSION: 3,
    MAX_UPLOAD_RETRIES: 3,
    RETRY_BASE_DELAY: 60000,
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
    CLEANUP_INTERVAL: 5 * 60 * 1000, // Cleanup every 5 minutes
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
    if (process.env.NODE_ENV === "production" && !this.cdnBaseUrl) {
      console.warn(
        [
          "##########################################################################################",
          "# WARNING: NEXT_PUBLIC_S3_CDN_URL is not set in a production environment.                #",
          "# Image URLs will fall back to the S3 endpoint, which is inefficient and may be incorrect. #",
          "# Please set this environment variable to your public CDN URL.                           #",
          "##########################################################################################",
        ].join("\n"),
      );
    }
    console.log(`[UnifiedImageService] Initialized in ${this.isReadOnly ? "READ-ONLY" : "READ-WRITE"} mode`);
    this.startRetryProcessing();
    this.startPeriodicCleanup();
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
        if (!options.forceRefresh && (await this.checkS3WithCache(s3Key))) {
          return { contentType: this.inferContentType(url), source: "s3", cdnUrl: this.getCdnUrl(s3Key) };
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
          if (result?.buffer) {
            result.buffer = Buffer.alloc(0);
          }
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

    return monitoredAsync(
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

        // 1️⃣  Pre-flight S3 check – another process may already have uploaded this logo.
        // Note: "clearbit" is included for legacy S3 lookups (historical data) but is no longer used for active fetching
        const possibleSources: LogoSource[] = ["google", "duckduckgo"] as const;
        const possibleExts = ["png", "jpg", "jpeg", "svg", "webp", "ico"] as const;

        const getHashCandidates = async (d: string): Promise<string[]> => {
          // Modern SHA-256 (current) + legacy MD5 8-char hash used by historical uploads
          const sha256 = (await import("@/lib/utils/hash-utils")).generateHash(d).substring(0, 8);
          const md5 = (await import("node:crypto")).createHash("md5").update(d).digest("hex").substring(0, 8);
          return [sha256, md5];
        };

        for (const src of possibleSources) {
          for (const ext of possibleExts) {
            for (const hash of await getHashCandidates(domain)) {
              // Manually compose the S3 key to match *any* historical scheme
              const filename = `${domain}_${src === "duckduckgo" ? "ddg" : src}_${hash}.${ext}`;
              const preflightKey = `${IMAGE_S3_PATHS.LOGOS_DIR}/${filename}`;

              if (await this.checkS3WithCache(preflightKey)) {
                const ct = ext === "svg" ? "image/svg+xml" : `image/${ext === "ico" ? "x-icon" : ext}`;
                const cachedResult: LogoFetchResult = {
                  domain,
                  s3Key: preflightKey,
                  cdnUrl: this.getCdnUrl(preflightKey),
                  url: undefined,
                  source: src,
                  contentType: ct,
                  timestamp: Date.now(),
                  isValid: true,
                } as LogoFetchResult;

                ServerCacheInstance.setLogoFetch(domain, cachedResult);
                return cachedResult;
              }
            }
          }
        }

        try {
          const logoData = await this.fetchExternalLogo(domain);
          if (!logoData?.buffer) throw new Error("No logo found");
          const validation = await this.validateLogo(logoData.buffer);
          const isValid = !validation.isGlobeIcon;
          let finalBuffer = logoData.buffer;
          let s3Key: string;
          if (isValid && options.invertColors) {
            const inverted = await this.invertLogo(logoData.buffer, domain);
            if (inverted.buffer) {
              finalBuffer = inverted.buffer;
              s3Key = this.generateS3Key(logoData.url || domain, {
                ...options,
                type: "logos",
                invertColors: true,
                source: logoData.source,
                domain,
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
              s3Key = this.generateS3Key(logoData.url || domain, {
                ...options,
                type: "logos",
                source: logoData.source,
                domain,
              });
            }
          } else {
            s3Key = this.generateS3Key(logoData.url || domain, {
              ...options,
              type: "logos",
              source: logoData.source,
              domain,
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
          return errorResult;
        }
      },
      { timeoutMs: this.CONFIG.FETCH_TIMEOUT, metadata: { domain, options } },
    );
  }

  private async invertLogo(buffer: Buffer, domain: string): Promise<{ buffer?: Buffer; analysis?: LogoInversion }> {
    try {
      const [analysis, processed] = await Promise.all([
        this.analyzeLogo(buffer, domain),
        this.processImageBuffer(buffer),
      ]);
      return { buffer: processed.processedBuffer, analysis };
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
          s3Client: s3Client as NonNullable<typeof s3Client>,
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
          const delay = this.CONFIG.RETRY_BASE_DELAY * 2 ** (attempts - 1);
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

  private async checkS3WithCache(key: string): Promise<boolean> {
    if (!s3Client || !this.s3BucketName) return false;
    try {
      await s3Client.send(new HeadObjectCommand({ Bucket: this.s3BucketName, Key: key }));
      return true;
    } catch {
      return false;
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
    options: ImageServiceOptions & { type?: string; source?: LogoSource; domain?: string },
  ): string {
    if (options.type === "logos" && options.domain && options.source) {
      return generateS3Key({
        type: "logo",
        domain: options.domain,
        source: options.source,
        url,
        inverted: options.invertColors,
        extension: getFileExtension(url),
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

  private determineContentType(buffer: Buffer): string {
    return detectImageContentType(buffer);
  }

  private inferContentType(url: string): string {
    return inferContentTypeFromUrl(url);
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
    const bufferHash = this.getBufferHash(buffer);
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
    const cacheKey = `${url}-${this.getBufferHash(buffer)}`;
    const cached = ServerCacheInstance.getLogoAnalysis(cacheKey);
    if (cached) return cached;
    const analysis = await analyzeImage(buffer);
    ServerCacheInstance.setLogoAnalysis(cacheKey, analysis);
    return analysis;
  }

  private getBufferHash(buffer: Buffer): string {
    return getBufferHash(buffer);
  }

  private async fetchExternalLogo(domain: string): Promise<ExternalFetchResult | null> {
    if (await this.domainFailureTracker.shouldSkip(domain)) {
      console.log(`[UnifiedImageService] Domain ${domain} is permanently blocked or in cooldown, skipping`);
      return null;
    }
    if (this.hasDomainFailedTooManyTimes(domain)) {
      console.log(`[UnifiedImageService] Domain ${domain} has failed too many times in this session, skipping`);
      return null;
    }
    const domainVariants = getDomainVariants(domain);
    for (const testDomain of domainVariants) {
      const sources: Array<{ name: LogoSource; urlFn: (d: string) => string; size: string }> = [
        { name: "google", urlFn: LOGO_SOURCES.google.hd, size: "hd" },
        { name: "google", urlFn: LOGO_SOURCES.google.md, size: "md" },
        { name: "duckduckgo", urlFn: LOGO_SOURCES.duckduckgo.hd, size: "hd" },
      ];
      for (const { name, urlFn, size } of sources) {
        const result = await this.tryFetchLogo(testDomain, name, urlFn, size, domain);
        if (result) {
          // Success - remove from failure tracker if it was there
          this.domainFailureTracker.removeFailure(domain);
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

      // Use fetchBinary which includes proper error handling and content type detection
      const { buffer: rawBuffer, contentType: responseContentType } = await fetchBinary(url, {
        headers: {
          ...DEFAULT_IMAGE_HEADERS,
          ...UnifiedImageService.getBrowserHeaders(),
        },
        timeout: this.CONFIG.LOGO_FETCH_TIMEOUT,
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
      // Use isRetryableHttpError to check if this error is worth retrying
      if (!isRetryableHttpError(error)) {
        console.warn(
          `[UnifiedImageService] Non-retryable error fetching logo for ${testDomain} from ${name} (${size}) at ${url}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
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
    // Run cleanup every 5 minutes
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

    // Clean up session tracking if needed
    if (now - this.lastCleanupTime > this.CONFIG.CLEANUP_INTERVAL) {
      // Limit session domains size
      if (this.sessionProcessedDomains.size > this.CONFIG.MAX_SESSION_DOMAINS) {
        this.sessionProcessedDomains.clear();
      }
      if (this.sessionFailedDomains.size > this.CONFIG.MAX_SESSION_DOMAINS) {
        this.sessionFailedDomains.clear();
      }

      // Clear old retry counts
      if (this.domainRetryCount.size > this.CONFIG.MAX_SESSION_DOMAINS) {
        // Keep only recent entries
        const entries = Array.from(this.domainRetryCount.entries());
        this.domainRetryCount.clear();
        // Keep last 50% of entries
        entries.slice(-Math.floor(this.CONFIG.MAX_SESSION_DOMAINS / 2)).forEach(([k, v]) => {
          this.domainRetryCount.set(k, v);
        });
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
    return (this.domainRetryCount.get(domain) || 0) >= this.CONFIG.MAX_RETRIES_PER_SESSION;
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
    this.sessionProcessedDomains.clear();
    this.sessionFailedDomains.clear();
    this.domainRetryCount.clear();
    this.sessionStartTime = Date.now();
  }

  static getBrowserHeaders(): Record<string, string> {
    // Use shared utility and add image-specific headers
    return {
      ...getBrowserHeaders(),
      "Sec-Fetch-Dest": "image",
      "Sec-Fetch-Mode": "no-cors",
      "Sec-Fetch-Site": "cross-site",
    };
  }

  // Domain blocklist methods are now handled by FailureTracker
}

let instance: UnifiedImageService | null = null;

/** Get singleton UnifiedImageService instance */
export function getUnifiedImageService(): UnifiedImageService {
  return (instance ||= new UnifiedImageService());
}
