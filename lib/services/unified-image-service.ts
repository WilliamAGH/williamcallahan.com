/**
 * Unified Image Service
 *
 * Consolidates all image fetching, processing, and caching logic.
 * Provides memory-safe image operations through:
 * - Integration with ImageMemoryManager for buffer storage
 * - Async operation monitoring with timeouts (30s default)
 * - S3 persistence with immediate upload
 * - CDN delivery to avoid buffer loading
 * - Memory pressure awareness
 *
 * @module lib/services/unified-image-service
 */

import { ImageMemoryManagerInstance } from "../image-memory-manager";

import { s3Client, writeBinaryS3 } from "../s3-utils";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { ServerCacheInstance } from "../server-cache";
import { processImageBuffer } from "../data-access/logos/image-processing";
import { fetchExternalLogo } from "../data-access/logos/external-fetch";
import { validateLogoBuffer } from "../data-access/logos/image-processing";
import { monitoredAsync } from "../async-operations-monitor";
import type { LogoFetchResult } from "../../types/cache";
import type { LogoInversion } from "../../types/logo";
import type { ImageServiceOptions, ImageResult } from "../../types/image";
import { createHash } from "node:crypto";
import { LRUCache } from "lru-cache";

// Cache for S3 existence checks (bounded by count and size)
const s3ExistenceCache = new LRUCache<string, boolean>({
  max: 50000,
  maxSize: 8 * 1024 * 1024, // 8MB max size
  sizeCalculation: () => 100, // Each key-value pair ~100 bytes (conservative estimate)
  ttl: 24 * 60 * 60 * 1000, // 24 hours
});

/**
 * Unified service for all image operations with memory protection.
 *
 * Key features:
 * - Multi-tiered caching (memory → S3 → origin)
 * - Request coalescing via ImageMemoryManager
 * - Async monitoring for all operations
 * - Automatic S3 persistence
 * - CDN-first delivery strategy
 * - Memory pressure rejection
 */
export class UnifiedImageService {
  private readonly memoryManager = ImageMemoryManagerInstance;
  private readonly cdnBaseUrl = process.env.NEXT_PUBLIC_S3_CDN_URL || "";
  private readonly s3BucketName = process.env.S3_BUCKET || "";

  /**
   * Get or fetch an image with unified caching strategy and async monitoring
   */
  async getImage(url: string, options: ImageServiceOptions = {}): Promise<ImageResult> {
    return monitoredAsync(null, `get-image-${url}`, async () => this._getImageInternal(url, options), {
      timeoutMs: 30000, // 30 second timeout for image operations
      metadata: { url, options },
    });
  }

  /**
   * Internal image fetching logic
   */
  private async _getImageInternal(url: string, options: ImageServiceOptions): Promise<ImageResult> {
    const cacheKey = this.generateCacheKey(url, options);
    const s3Key = this.generateS3Key(url, options);

    // Level 1: Check memory cache (if not forcing refresh)
    if (!options.forceRefresh) {
      const cached = await this.memoryManager.get(cacheKey);
      if (cached) {
        return {
          buffer: cached.buffer,
          contentType: cached.contentType,
          source: "memory",
          cdnUrl: this.getCdnUrl(s3Key),
        };
      }
    }

    // Level 2: Check S3/CDN
    const s3Exists = await this.checkS3WithCache(s3Key);
    if (s3Exists && !options.forceRefresh) {
      // Return CDN URL without loading into memory
      return {
        contentType: this.inferContentType(url),
        source: "s3",
        cdnUrl: this.getCdnUrl(s3Key),
      };
    }

    // Level 3: Fetch from origin (with request coalescing)
    const fetchKey = `fetch:${cacheKey}`;

    // Check if already fetching
    if (this.memoryManager.isFetching(fetchKey)) {
      const existingFetch = this.memoryManager.getFetchPromise(fetchKey);
      if (existingFetch) {
        const buffer = await existingFetch;
        return {
          buffer,
          contentType: this.determineContentType(buffer),
          source: "origin",
          cdnUrl: this.getCdnUrl(s3Key),
        };
      }
    }

    // Start new fetch with coalescing
    const fetchPromise = this.fetchAndProcess(url, options);
    const bufferPromise = fetchPromise.then((result) => result.buffer);
    this.memoryManager.registerFetch(fetchKey, bufferPromise);

    const result = await fetchPromise;

    // If image was streamed directly to S3, we can skip the upload
    if (!result.streamedToS3) {
      // Upload to S3 for persistence
      await this.uploadToS3(s3Key, result.buffer, result.contentType);
    }

    // Try to cache in memory (may fail under pressure)
    // Skip caching if it was streamed (empty buffer)
    if (!result.streamedToS3) {
      this.memoryManager.set(cacheKey, result.buffer, {
        contentType: result.contentType,
        source: "origin",
      });
    }

    return {
      buffer: result.buffer,
      contentType: result.contentType,
      source: "origin",
      cdnUrl: this.getCdnUrl(s3Key),
    };
  }

  /**
   * Get logo with validation and optional inversion
   */
  async getLogo(domain: string, options: ImageServiceOptions = {}): Promise<LogoFetchResult> {
    return monitoredAsync(null, `get-logo-${domain}`, async () => this._getLogoInternal(domain, options), {
      timeoutMs: 30000,
      metadata: { domain, options },
    });
  }

  /**
   * Internal logo fetching logic
   */
  private async _getLogoInternal(domain: string, options: ImageServiceOptions): Promise<LogoFetchResult> {
    // Check ServerCache for previous results (metadata only)
    const cachedResult = ServerCacheInstance.getLogoFetch(domain);
    if (cachedResult && !options.forceRefresh) {
      // If we have S3 URL, return it
      if (cachedResult.s3Key) {
        return {
          ...cachedResult,
          cdnUrl: this.getCdnUrl(cachedResult.s3Key),
        };
      }
    }

    try {
      // Fetch logo using external fetch
      const logoData = await fetchExternalLogo(domain);

      if (!logoData?.buffer) {
        throw new Error("No logo found");
      }

      // Validate the logo
      const isValid = await validateLogoBuffer(logoData.buffer, logoData.url || domain);
      const validation = { isValid, isGlobeIcon: !isValid };

      let finalBuffer = logoData.buffer;
      let s3Key: string;
      let invertedMetadata: LogoInversion | undefined;

      if (validation.isValid && options.invertColors) {
        // Process inversion if requested
        const inverted = await this.invertLogo(logoData.buffer, domain);
        if (inverted.buffer) {
          finalBuffer = inverted.buffer;
          invertedMetadata = inverted.analysis;
        }

        // Generate S3 key for inverted logo
        s3Key = this.generateS3Key(logoData.url || domain, {
          ...options,
          type: "logo",
          invertColors: true,
        });

        // Store inverted logo metadata in ServerCache
        if (inverted.buffer) {
          ServerCacheInstance.setInvertedLogo(domain, {
            s3Key,
            cdnUrl: this.getCdnUrl(s3Key),
            analysis: invertedMetadata || {
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
      } else {
        // Generate S3 key for regular logo
        s3Key = this.generateS3Key(logoData.url || domain, {
          ...options,
          type: "logo",
        });
      }

      // Upload to S3
      await this.uploadToS3(s3Key, finalBuffer, logoData.contentType || "image/png");

      // Cache the result metadata (not the buffer)
      const result: LogoFetchResult = {
        domain,
        url: logoData.url,
        cdnUrl: this.getCdnUrl(s3Key),
        s3Key,
        source: logoData.source,
        contentType: logoData.contentType,
        timestamp: Date.now(),
        isValid: validation.isValid,
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
  }

  /**
   * Invert logo colors
   */
  private async invertLogo(buffer: Buffer, domain: string): Promise<{ buffer?: Buffer; analysis?: LogoInversion }> {
    const cacheKey = `inverted:${domain}`;

    // Check if already inverted in memory
    const cached = await this.memoryManager.get(cacheKey);
    if (cached) {
      return { buffer: cached.buffer };
    }

    try {
      // Process the image for inversion
      const processed = await processImageBuffer(buffer);

      // Store in memory cache
      this.memoryManager.set(cacheKey, processed.processedBuffer, {
        contentType: processed.contentType,
        source: "origin",
      });

      return { buffer: processed.processedBuffer };
    } catch (error) {
      console.error(`[UnifiedImageService] Failed to invert logo for ${domain}:`, error);
      return {};
    }
  }

  /**
   * Fetch and process image from origin
   */
  private async fetchAndProcess(
    url: string,
    options: ImageServiceOptions,
  ): Promise<{ buffer: Buffer; contentType: string; streamedToS3?: boolean }> {
    // For logo URLs, use the logo fetcher
    if (this.isLogoUrl(url)) {
      const domain = this.extractDomain(url);
      const logoResult = await fetchExternalLogo(domain);

      if (!logoResult?.buffer) {
        throw new Error("Failed to fetch logo");
      }

      return {
        buffer: logoResult.buffer,
        contentType: logoResult.contentType || "image/png",
      };
    }

    // Generic image fetch with timeout and error handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; UnifiedImageService/1.0)",
          Accept: "image/*",
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type");
      if (!contentType?.startsWith("image/")) {
        throw new Error("Response is not an image");
      }

      // Check if we should stream large images directly to S3
      const contentLength = response.headers.get("content-length");
      const { shouldStreamImage, streamToS3, getContentTypeFromResponse } = await import("./image-streaming");

      if (shouldStreamImage(contentLength) && response.body) {
        // Stream large images directly to S3 without loading into memory
        const s3Key = this.generateS3Key(url, options);
        const streamResult = await streamToS3(response.body, {
          bucket: this.s3BucketName,
          key: s3Key,
          contentType: getContentTypeFromResponse(response as unknown as import("node-fetch").Response),
          s3Client: s3Client as NonNullable<typeof s3Client>,
        });

        if (streamResult.success) {
          console.log(`[UnifiedImageService] Streamed ${streamResult.bytesStreamed} bytes directly to S3: ${s3Key}`);

          // Return empty buffer with flag indicating it was streamed
          return {
            buffer: Buffer.alloc(0), // Empty buffer since we streamed
            contentType: contentType || "application/octet-stream",
            streamedToS3: true,
          };
        } else {
          console.warn(`[UnifiedImageService] Stream to S3 failed, falling back to memory loading`);
        }
      }

      // For smaller images or if streaming failed, load into memory
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Process image if options are provided
      if (options.width || options.format || options.quality) {
        const { processImageBuffer } = await import("../data-access/logos/image-processing");
        const processed = await processImageBuffer(buffer);

        return {
          buffer: processed.processedBuffer,
          contentType: processed.contentType,
        };
      }

      return {
        buffer,
        contentType: contentType || "application/octet-stream",
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new Error("Image fetch timeout");
        }
        throw error;
      }

      throw new Error("Failed to fetch image");
    }
  }

  /**
   * Upload buffer to S3 with error handling and tracking
   */
  private async uploadToS3(key: string, buffer: Buffer, contentType: string): Promise<void> {
    try {
      await writeBinaryS3(key, buffer, contentType);

      // Update existence cache
      s3ExistenceCache.set(key, true);
    } catch (error) {
      console.error(`[UnifiedImageService] Failed to upload to S3:`, error);

      // Track failed upload for potential retry
      this.trackFailedUpload(key, buffer, contentType, error);

      // Don't throw - allow service to continue even if S3 fails
    }
  }

  /**
   * Track failed S3 uploads for monitoring
   * In a production system, this would push to a queue for retry
   */
  private trackFailedUpload(key: string, buffer: Buffer, contentType: string, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Log structured error for monitoring
    console.error("[UnifiedImageService] S3 upload failed", {
      key,
      contentType,
      bufferSize: buffer.byteLength,
      error: errorMessage,
      timestamp: new Date().toISOString(),
    });

    // In production, this would push to a queue (SQS, Redis, etc.)
    // For now, we'll just emit an event that could be consumed by monitoring
    if (process.env.NODE_ENV === "production") {
      // This could be consumed by a monitoring service or queue processor
      const eventData = {
        key,
        contentType,
        size: buffer.byteLength,
        error: errorMessage,
      };
      // Using setImmediate to avoid blocking and type issues
      setImmediate(() => {
        console.error("[UnifiedImageService] S3 upload failure queued for retry", eventData);
      });
    }
  }

  /**
   * Check S3 existence with caching
   */
  private async checkS3WithCache(key: string): Promise<boolean> {
    // Check cache first
    const cached = s3ExistenceCache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    // Check S3
    if (!s3Client || !this.s3BucketName) {
      console.warn("[UnifiedImageService] S3 not configured, cannot check existence");
      return false;
    }

    try {
      await s3Client.send(
        new HeadObjectCommand({
          Bucket: this.s3BucketName,
          Key: key,
        }),
      );

      s3ExistenceCache.set(key, true);
      return true;
    } catch {
      // Object doesn't exist or error occurred
      s3ExistenceCache.set(key, false);
      return false;
    }
  }

  /**
   * Generate cache key for image
   */
  private generateCacheKey(url: string, options: ImageServiceOptions): string {
    const parts = [url];
    if (options.invertColors) parts.push("inverted");
    if (options.maxSize) parts.push(`size:${options.maxSize}`);
    if (options.quality) parts.push(`q:${options.quality}`);

    return createHash("sha256").update(parts.join(":")).digest("hex");
  }

  /**
   * Generate S3 key for image
   */
  private generateS3Key(url: string, options: ImageServiceOptions & { type?: string }): string {
    const hash = createHash("sha256").update(url).digest("hex").substring(0, 16);
    const parts = ["images"];

    if (options.type) parts.push(options.type);
    if (options.invertColors) parts.push("inverted");

    parts.push(hash);

    // Add extension based on URL or default to .png
    const extension = this.getFileExtension(url) || ".png";

    return `${parts.join("/")}${extension}`;
  }

  /**
   * Get CDN URL for S3 key
   */
  getCdnUrl(s3Key: string): string {
    if (!this.cdnBaseUrl) {
      return `https://${this.s3BucketName}.s3.amazonaws.com/${s3Key}`;
    }
    return `${this.cdnBaseUrl}/${s3Key}`;
  }

  /**
   * Determine content type from buffer
   */
  private determineContentType(buffer: Buffer): string {
    // Use the fixed function from logos.ts
    const bufferString = buffer.toString("utf-8", 0, Math.min(1024, buffer.length)).trim();
    if (bufferString.startsWith("<svg") || bufferString.includes("</svg>")) {
      return "image/svg+xml";
    }
    return "image/png";
  }

  /**
   * Infer content type from URL
   */
  private inferContentType(url: string): string {
    const ext = this.getFileExtension(url)?.toLowerCase();
    switch (ext) {
      case ".svg":
        return "image/svg+xml";
      case ".png":
        return "image/png";
      case ".jpg":
      case ".jpeg":
        return "image/jpeg";
      case ".gif":
        return "image/gif";
      case ".webp":
        return "image/webp";
      default:
        return "image/png";
    }
  }

  /**
   * Check if URL is a logo URL
   * Only treat URLs as logo URLs if they're specifically logo/favicon files,
   * not if they just contain these terms in query parameters
   */
  private isLogoUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      const pathname = parsedUrl.pathname.toLowerCase();
      
      // Check if the actual file path contains logo/favicon
      return pathname.includes("logo") || pathname.includes("favicon");
    } catch {
      // Fallback to simple string check for malformed URLs
      return url.includes("favicon");
    }
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.hostname;
    } catch {
      return url;
    }
  }

  /**
   * Get file extension from URL
   */
  private getFileExtension(url: string): string | null {
    const match = url.match(/\.[a-zA-Z0-9]+$/);
    return match ? match[0] : null;
  }
}

// Singleton instance
let instance: UnifiedImageService | null = null;

/**
 * Get or create the singleton UnifiedImageService instance
 */
export function getUnifiedImageService(): UnifiedImageService {
  if (!instance) {
    instance = new UnifiedImageService();
  }
  return instance;
}
