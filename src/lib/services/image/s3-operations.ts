/**
 * S3 upload, retry queue, and CDN URL generation
 * @module lib/services/image/s3-operations
 */

import { writeBinaryS3 } from "@/lib/s3/binary";
import { getDeterministicTimestamp } from "@/lib/utils/deterministic-timestamp";
import {
  parseS3Key,
  generateS3Key as generateS3KeyUtil,
  getFileExtension,
} from "@/lib/utils/hash-utils";
import { UNIFIED_IMAGE_SERVICE_CONFIG } from "@/lib/constants";
import { buildCdnUrl, getCdnConfigFromEnv } from "@/lib/utils/cdn-utils";
import { safeStringifyValue, isRetryableError } from "@/lib/utils/error-utils";
import { computeExponentialDelay, retryWithOptions } from "@/lib/utils/retry";
import { getExtensionFromContentType, IMAGE_EXTENSIONS } from "@/lib/utils/content-type";
import { getMemoryHealthMonitor } from "@/lib/health/memory-health-monitor";
import logger from "@/lib/utils/logger";

import type { LogoSource } from "@/types/logo";
import type { ImageServiceOptions } from "@/types/image";
import type { RetryEntry } from "@/types/image-service";

const CONFIG = UNIFIED_IMAGE_SERVICE_CONFIG;

/**
 * S3 storage operations for the unified image service
 */
export class S3Operations {
  private readonly isReadOnly: boolean;
  private uploadRetryQueue = new Map<string, RetryEntry>();
  private retryTimerId: NodeJS.Timeout | null = null;
  private getLogo: ((domain: string) => Promise<{ cdnUrl?: string; error?: string }>) | null = null;

  constructor(isReadOnly: boolean) {
    this.isReadOnly = isReadOnly;
    this.startRetryProcessing();
  }

  /**
   * Set the logo fetch function for retry operations
   * This breaks the circular dependency with LogoFetcher
   */
  setLogoFetcher(fn: (domain: string) => Promise<{ cdnUrl?: string; error?: string }>): void {
    this.getLogo = fn;
  }

  /**
   * Upload buffer to S3
   */
  async uploadToS3(key: string, buffer: Buffer, contentType: string): Promise<void> {
    if (this.isReadOnly) return;
    try {
      await writeBinaryS3(key, buffer, contentType);
    } catch (error) {
      this.trackFailedUpload(key, buffer, contentType, error);
    }
  }

  /**
   * Track failed upload for retry
   */
  trackFailedUpload(key: string, buffer: Buffer, contentType: string, error: unknown): void {
    // Enforce bounds on retry queue
    if (this.uploadRetryQueue.size >= CONFIG.MAX_RETRY_QUEUE_SIZE) {
      // Remove oldest entries when limit reached
      const entriesToRemove = Math.floor(CONFIG.MAX_RETRY_QUEUE_SIZE * 0.2); // Remove 20%
      const keys = Array.from(this.uploadRetryQueue.keys()).slice(0, entriesToRemove);
      for (const k of keys) {
        this.uploadRetryQueue.delete(k);
      }
      logger.warn("Retry queue limit reached", {
        service: "S3Operations",
        removed: entriesToRemove,
      });
    }

    const errorMessage = safeStringifyValue(error);
    const isMemoryPressure = errorMessage.includes("Insufficient memory headroom");
    if (isMemoryPressure) {
      const sourceUrl = this.extractSourceUrlFromKey(key);
      if (sourceUrl) {
        const existingRetry = this.uploadRetryQueue.get(key);
        const attempts = (existingRetry?.attempts || 0) + 1;
        if (attempts <= CONFIG.MAX_UPLOAD_RETRIES) {
          // Calculate exponential backoff with jitter
          const delay = computeExponentialDelay(
            attempts,
            CONFIG.RETRY_BASE_DELAY,
            CONFIG.RETRY_MAX_DELAY,
            CONFIG.RETRY_JITTER_FACTOR,
          );
          const nextRetry = getDeterministicTimestamp() + delay;
          this.uploadRetryQueue.set(key, {
            sourceUrl,
            contentType,
            attempts,
            lastAttempt: getDeterministicTimestamp(),
            nextRetry,
          });
          logger.info(
            `[S3Operations] S3 upload failed due to memory pressure. Retry ${attempts}/${CONFIG.MAX_UPLOAD_RETRIES} scheduled for ${new Date(nextRetry).toISOString()}`,
          );
        } else {
          logger.info(
            `[S3Operations] S3 upload failed after ${CONFIG.MAX_UPLOAD_RETRIES} attempts`,
          );
          this.uploadRetryQueue.delete(key);
        }
      }
    } else {
      logger.error("[S3Operations] S3 upload failed", error, {
        key,
        contentType,
        bufferSize: buffer.byteLength,
      });
    }
  }

  /**
   * Extract source URL (domain) from S3 key
   */
  extractSourceUrlFromKey(s3Key: string): string | null {
    if (!s3Key.includes("/logos/") && !s3Key.includes("/logo/")) return null;
    return parseS3Key(s3Key).domain ?? null;
  }

  /**
   * Start periodic retry processing
   */
  private startRetryProcessing(): void {
    this.retryTimerId = setInterval(() => void this.processRetryQueue(), 60000);
    // Prevent interval from keeping Node.js alive (especially in tests)
    this.retryTimerId.unref();
    if (process.env.NODE_ENV !== "test") process.on("beforeExit", () => this.stopRetryProcessing());
  }

  /**
   * Stop retry processing
   */
  stopRetryProcessing(): void {
    if (this.retryTimerId) {
      clearInterval(this.retryTimerId);
      this.retryTimerId = null;
    }
  }

  /**
   * Process the retry queue for failed uploads
   */
  private processRetryQueue(): void {
    if (!this.getLogo) return;

    const now = getDeterministicTimestamp();
    // Use memory health monitor instead of direct memory check
    const memoryMonitor = getMemoryHealthMonitor();
    if (!memoryMonitor.shouldAcceptNewRequests()) {
      logger.info("[S3Operations] Memory pressure detected, skipping retry processing");
      return;
    }
    for (const [key, retry] of this.uploadRetryQueue.entries()) {
      if (retry.nextRetry <= now) {
        // Mark as in-flight to prevent overlapping retry chains
        this.uploadRetryQueue.set(key, { ...retry, nextRetry: now + CONFIG.RETRY_MAX_DELAY });
        logger.info(
          `[S3Operations] Retrying S3 upload for ${key} (attempt ${retry.attempts}/${CONFIG.MAX_UPLOAD_RETRIES})`,
        );
        // Use retryWithOptions for consistent retry behavior
        void retryWithOptions(
          async () => {
            const result = await this.getLogo!(retry.sourceUrl);
            if (!result.cdnUrl) {
              throw new Error(result.error || "Logo fetch failed");
            }
            return result;
          },
          {
            maxRetries: CONFIG.MAX_UPLOAD_RETRIES - retry.attempts,
            baseDelay: CONFIG.RETRY_BASE_DELAY,
            isRetryable: (error) => isRetryableError(error),
            onRetry: (error, attempt) => {
              void error; // Explicitly mark as unused per project convention
              logger.info(
                `[S3Operations] Retry ${attempt + retry.attempts}/${CONFIG.MAX_UPLOAD_RETRIES} for ${key}`,
              );
            },
          },
        )
          .then((result) => {
            if (result?.cdnUrl) {
              this.uploadRetryQueue.delete(key);
              logger.info(`[S3Operations] Retry successful for ${key}`);
            }
            return undefined;
          })
          .catch((error) => {
            logger.error("[S3Operations] All retries failed", error, { key });
            this.uploadRetryQueue.delete(key);
          });
      }
    }
  }

  /**
   * Perform cleanup of stale retry entries
   */
  performRetryQueueCleanup(): void {
    const now = getDeterministicTimestamp();
    for (const [key, retry] of this.uploadRetryQueue.entries()) {
      if (now - retry.lastAttempt > 60 * 60 * 1000) this.uploadRetryQueue.delete(key);
    }
  }

  /**
   * Generate S3 key for storage
   */
  generateS3Key(
    url: string,
    options: ImageServiceOptions & {
      type?: string;
      source?: LogoSource;
      domain?: string;
      contentType?: string;
    },
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

      return generateS3KeyUtil({
        type: "logo",
        domain: options.domain,
        source: options.source,
        url,
        inverted: options.invertColors,
        extension,
      });
    } else {
      // For generic images
      return generateS3KeyUtil({
        type: "image",
        url,
        inverted: options.invertColors,
        variant: options.type,
        extension: getFileExtension(url),
      });
    }
  }

  /**
   * Get CDN URL for S3 key
   */
  getCdnUrl(s3Key: string): string {
    try {
      return buildCdnUrl(s3Key, getCdnConfigFromEnv());
    } catch (error) {
      logger.warn(`[S3Operations] CDN config missing; returning empty CDN URL`, {
        service: "S3Operations",
        s3Key,
        error: safeStringifyValue(error),
      });
      return "";
    }
  }
}
