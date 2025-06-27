/**
 * Unified image service - fetching, processing, caching
 * Memory-safe operations with S3/CDN delivery
 * @module lib/services/unified-image-service
 */
import { s3Client, writeBinaryS3, readJsonS3, writeJsonS3 } from "../s3-utils";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { ServerCacheInstance } from "../server-cache";
import { getDomainVariants } from "../utils/domain-utils";
import { LOGO_SOURCES, MEMORY_THRESHOLDS, LOGO_BLOCKLIST_S3_PATH } from "../constants";
import { getBaseUrl } from "../utils/get-base-url";
import { isDebug } from "../utils/debug";
import { isS3ReadOnly } from "../utils/s3-read-only";
import type { LogoSource, BlockedDomain } from "../../types/logo";
import type { ExternalFetchResult } from "../../types/image";
import { extractBasicImageMeta } from "../image-handling/image-metadata";
import { analyzeImage } from "../image-handling/image-analysis"; // now lightweight stub
import { processImageBuffer as sharedProcessImageBuffer } from "../image-handling/shared-image-processing";

import { monitoredAsync } from "../async-operations-monitor";
import type { LogoFetchResult, LogoValidationResult } from "../../types/cache";
import type { LogoInversion } from "../../types/logo";
import type { ImageServiceOptions, ImageResult } from "../../types/image";
import { createHash } from "node:crypto";

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
    MAX_SESSION_DOMAINS: 1000, // Limit processed domains per session
    MAX_RETRY_QUEUE_SIZE: 100, // Limit retry queue size
    MAX_BLOCKLIST_SIZE: 5000, // Limit blocklist size
  };
  private uploadRetryQueue = new Map<
    string,
    { sourceUrl: string; contentType: string; attempts: number; lastAttempt: number; nextRetry: number }
  >();
  private retryTimerId: NodeJS.Timeout | null = null;
  private domainBlocklist = new Map<string, BlockedDomain>();
  private blocklistLoaded = false;

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
    void this.loadDomainBlocklist();
  }

  private logError(operation: string, error: unknown, metadata?: Record<string, unknown>): void {
    console.error(
      `[UnifiedImageService] ${operation}:`,
      error instanceof Error ? error.message : String(error),
      metadata || {},
    );
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit & { timeout?: number } = {},
  ): Promise<Response | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || this.CONFIG.FETCH_TIMEOUT);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      if (this.isDev && !response.ok) {
        console.warn(`[UnifiedImageService] Non-OK response (${response.status}) for ${url}`);
      }
      return response;
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof Error && error.name === "AbortError") {
        this.logError("Fetch timeout", error, { url });
        return null;
      }
      throw error;
    }
  }

  /** Fetch image with caching (memory → S3 → origin) */
  async getImage(url: string, options: ImageServiceOptions = {}): Promise<ImageResult> {
    return monitoredAsync(
      null,
      `get-image-${url}`,
      async () => {
        const s3Key = this.generateS3Key(url, options);
        if (!options.forceRefresh && (await this.checkS3WithCache(s3Key))) {
          return { contentType: this.inferContentType(url), source: "s3", cdnUrl: this.getCdnUrl(s3Key) };
        }
        if (this.isReadOnly) throw new Error(`Image not available in read-only mode: ${url}`);
        const result = await this.fetchAndProcess(url, options);
        if (!result.streamedToS3 && !this.isReadOnly) {
          await this.uploadToS3(s3Key, result.buffer, result.contentType);
        }
        return {
          buffer: result.buffer,
          contentType: result.contentType,
          source: "origin",
          cdnUrl: this.getCdnUrl(s3Key),
        };
      },
      { timeoutMs: this.CONFIG.FETCH_TIMEOUT, metadata: { url, options } },
    );
  }

  /** Get logo with validation, optional inversion */
  async getLogo(domain: string, options: ImageServiceOptions = {}): Promise<LogoFetchResult> {
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
    if (this.isLogoUrl(url)) {
      const logoResult = await this.fetchExternalLogo(this.extractDomain(url));
      if (!logoResult?.buffer) throw new Error("Failed to fetch logo");
      return { buffer: logoResult.buffer, contentType: logoResult.contentType || "image/png" };
    }
    const response = await this.fetchWithTimeout(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; UnifiedImageService/1.0)", Accept: "image/*" },
    });
    if (!response) throw new Error("Failed to fetch image");
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
      const buffer = Buffer.from(await response.arrayBuffer());
      if (options.width || options.format || options.quality) {
        const processed = await this.processImageBuffer(buffer);
        return { buffer: processed.processedBuffer, contentType: processed.contentType };
      }
      return { buffer, contentType: contentType || "application/octet-stream" };
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
    return createHash("sha256")
      .update(
        [
          url,
          options.invertColors && "inverted",
          options.maxSize && `size:${options.maxSize}`,
          options.quality && `q:${options.quality}`,
        ]
          .filter(Boolean)
          .join(":"),
      )
      .digest("hex");
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
    const memUsage = process.memoryUsage();
    if (memUsage.rss > (MEMORY_THRESHOLDS.MEMORY_WARNING_THRESHOLD || 2 * 1024 * 1024 * 1024)) {
      console.log("[UnifiedImageService] Memory pressure detected, skipping retry processing");
      return;
    }
    for (const [key, retry] of this.uploadRetryQueue.entries()) {
      if (retry.nextRetry <= now) {
        console.log(
          `[UnifiedImageService] Retrying S3 upload for ${key} (attempt ${retry.attempts}/${this.CONFIG.MAX_UPLOAD_RETRIES})`,
        );
        void this.getLogo(retry.sourceUrl)
          .then((logoResult) => {
            if (logoResult.cdnUrl) {
              this.uploadRetryQueue.delete(key);
              console.log(`[UnifiedImageService] Retry successful for ${key}`);
            } else if (logoResult.error) {
              retry.attempts++;
              retry.lastAttempt = now;
              if (retry.attempts > this.CONFIG.MAX_UPLOAD_RETRIES) {
                this.logError("Max retries exceeded", new Error("Upload retry limit reached"), { key });
                this.uploadRetryQueue.delete(key);
              } else {
                retry.nextRetry = now + this.CONFIG.RETRY_BASE_DELAY * 2 ** (retry.attempts - 1);
              }
            }
          })
          .catch((error) => {
            this.logError("Error during retry", error, { key });
          });
      }
    }
  }

  private generateS3Key(
    url: string,
    options: ImageServiceOptions & { type?: string; source?: LogoSource; domain?: string },
  ): string {
    const parts = ["images"];
    if (options.type === "logos" && options.domain && options.source) {
      parts.push("logos");
      if (options.invertColors) parts.push("inverted");
      const hash = createHash("sha256").update(url).digest("hex").substring(0, 8);
      const normalizedDomain = options.domain.replace(/[^a-zA-Z0-9.-]/g, "_");
      const sourceAbbrev = options.source === "duckduckgo" ? "ddg" : options.source;
      return `${parts.join("/")}/${normalizedDomain}_${sourceAbbrev}_${hash}${this.getFileExtension(url) || ".png"}`;
    } else {
      const hash = createHash("sha256").update(url).digest("hex").substring(0, 16);
      if (options.type) parts.push(options.type);
      if (options.invertColors) parts.push("inverted");
      parts.push(hash);
      return `${parts.join("/")}${this.getFileExtension(url) || ".png"}`;
    }
  }

  /** Get CDN URL for S3 key */
  getCdnUrl(s3Key: string): string {
    if (this.cdnBaseUrl) return `${this.cdnBaseUrl}/${s3Key}`;
    const s3Host = this.s3ServerUrl
      ? (() => {
          try {
            return new URL(this.s3ServerUrl).hostname;
          } catch {
            return "s3.amazonaws.com";
          }
        })()
      : "s3.amazonaws.com";
    return `https://${this.s3BucketName}.${s3Host}/${s3Key}`;
  }

  private determineContentType(buffer: Buffer): string {
    return buffer.toString("utf-8", 0, Math.min(1024, buffer.length)).trim().includes("<svg")
      ? "image/svg+xml"
      : "image/png";
  }

  private inferContentType(url: string): string {
    const ext = this.getFileExtension(url)?.toLowerCase() || "";
    return (
      {
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
      }[ext] || "image/png"
    );
  }

  private isLogoUrl(url: string): boolean {
    const pathname = (() => {
      try {
        return new URL(url).pathname.toLowerCase();
      } catch {
        return url;
      }
    })();
    return pathname.includes("logo") || pathname.includes("favicon");
  }
  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }
  private getFileExtension(url: string): string | null {
    return url.match(/\.[a-zA-Z0-9]+$/)?.[0] || null;
  }

  /** Analyze logo from URL for inversion needs */
  async getLogoAnalysisByUrl(url: string): Promise<LogoInversion | null> {
    const cacheKey = `${url}-analysis`;
    const cached = ServerCacheInstance.getLogoAnalysis(cacheKey);
    if (cached) return cached;
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      return await this.analyzeLogo(Buffer.from(await response.arrayBuffer()), url);
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
    return createHash("sha256").update(buffer).digest("hex");
  }

  private async fetchExternalLogo(domain: string): Promise<ExternalFetchResult | null> {
    if (this.isDomainBlocked(domain)) {
      console.log(`[UnifiedImageService] Domain ${domain} is permanently blocked, skipping`);
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
        if (result) return result;
      }
    }
    this.markDomainAsFailed(domain);
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
      const response = await this.fetchWithTimeout(url, {
        headers: UnifiedImageService.getBrowserHeaders(),
        timeout: this.CONFIG.LOGO_FETCH_TIMEOUT,
      });
      if (!response || !response.ok) return null;
      if (isDebug && response)
        console.log(`[UnifiedImageService] ${name} (${size}) response status: ${response.status} for ${url}`);
      const rawBuffer = Buffer.from(await response.arrayBuffer());
      if (!rawBuffer || rawBuffer.byteLength < this.CONFIG.MIN_BUFFER_SIZE) {
        if (isDebug)
          console.log(
            `[UnifiedImageService] ${name} (${size}) buffer too small: ${rawBuffer?.byteLength || 0} bytes for ${testDomain}`,
          );
        return null;
      }
      if (await this.checkIfGlobeIcon(rawBuffer, url, response, testDomain, name)) return null;
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
      if ((error as Error).name !== "AbortError") {
        console.warn(
          `[UnifiedImageService] Error fetching logo for ${testDomain} from ${name} (${size}) at ${url}: ${error instanceof Error ? error.message : String(error)}`,
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
      formData.append(
        "image",
        new Blob([rawBuffer], { type: response.headers.get("content-type") ?? "application/octet-stream" }),
        "logo-to-validate",
      );
      formData.append("url", url);
      const validateResponse = await fetch(new URL("/api/validate-logo", baseUrl).toString(), {
        method: "POST",
        body: formData,
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
      void this.addDomainToBlocklist(domain, `Failed ${currentCount} times across sessions`);
    }
  }

  private resetDomainSessionTracking(): void {
    this.sessionProcessedDomains.clear();
    this.sessionFailedDomains.clear();
    this.domainRetryCount.clear();
    this.sessionStartTime = Date.now();
  }

  static getBrowserHeaders(): Record<string, string> {
    const userAgents = [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
    ];
    return {
      "User-Agent":
        userAgents[Math.floor(Math.random() * userAgents.length)] ||
        userAgents[0] ||
        "Mozilla/5.0 (compatible; UnifiedImageService/1.0)",
      Accept: "image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      Referer: "https://www.google.com/",
      "Sec-Fetch-Dest": "image",
      "Sec-Fetch-Mode": "no-cors",
      "Sec-Fetch-Site": "cross-site",
    };
  }

  private async loadDomainBlocklist(): Promise<void> {
    if (this.blocklistLoaded) return;
    try {
      const blocklist = await readJsonS3<BlockedDomain[]>(LOGO_BLOCKLIST_S3_PATH);
      if (blocklist && Array.isArray(blocklist)) {
        this.domainBlocklist.clear();
        blocklist.forEach((entry) => this.domainBlocklist.set(entry.domain, entry));
        this.blocklistLoaded = true;
        console.log(`[UnifiedImageService] Loaded ${blocklist.length} blocked domains from S3`);
      }
    } catch (error) {
      if (error instanceof Error && !error.message.includes("NoSuchKey"))
        this.logError("Failed to load domain blocklist", error);
      this.blocklistLoaded = true;
    }
  }

  private async saveDomainBlocklist(): Promise<void> {
    try {
      const blocklist = Array.from(this.domainBlocklist.values());
      await writeJsonS3(LOGO_BLOCKLIST_S3_PATH, blocklist);
      console.log(`[UnifiedImageService] Saved ${blocklist.length} blocked domains to S3`);
    } catch (error) {
      this.logError("Failed to save domain blocklist", error);
    }
  }

  private isDomainBlocked(domain: string): boolean {
    return this.blocklistLoaded && this.domainBlocklist.has(domain);
  }

  private addDomainToBlocklist(domain: string, reason: string): void {
    // Enforce bounds on blocklist
    if (this.domainBlocklist.size >= this.CONFIG.MAX_BLOCKLIST_SIZE) {
      // Remove oldest entries when limit reached
      const entriesToRemove = Math.floor(this.CONFIG.MAX_BLOCKLIST_SIZE * 0.1); // Remove 10%
      const sortedEntries = Array.from(this.domainBlocklist.entries()).sort(
        ([, a], [, b]) => a.lastAttempt - b.lastAttempt,
      );

      for (let i = 0; i < entriesToRemove; i++) {
        const [keyToRemove] = sortedEntries[i] || [];
        if (keyToRemove) {
          this.domainBlocklist.delete(keyToRemove);
        }
      }
      console.log(`[UnifiedImageService] Blocklist limit reached, removed ${entriesToRemove} oldest entries`);
    }

    this.domainBlocklist.set(domain, {
      domain,
      failureCount: this.domainRetryCount.get(domain) || this.CONFIG.PERMANENT_FAILURE_THRESHOLD,
      lastAttempt: Date.now(),
      reason,
    });
    void this.saveDomainBlocklist();
  }
}

let instance: UnifiedImageService | null = null;

/** Get singleton UnifiedImageService instance */
export function getUnifiedImageService(): UnifiedImageService {
  return (instance ||= new UnifiedImageService());
}
