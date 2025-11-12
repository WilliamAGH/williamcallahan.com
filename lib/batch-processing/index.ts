import { RequestPriority } from "@/types/services";
import { MemoryHealthMonitor } from "@/lib/health/memory-health-monitor";
import { MemoryAwareRequestScheduler } from "@/lib/services/memory-aware-scheduler";
import { monitoredAsync } from "@/lib/async-operations-monitor";
import { retryWithOptions } from "@/lib/utils/retry";
import { waitForPermit } from "@/lib/rate-limiter";
import { debugLog } from "@/lib/utils/debug";
import { getMonotonicTime } from "@/lib/utils";
import type { BatchProcessorOptions, BatchResult, LogLevel } from "@/types/batch-processing";

// Re-export types for backward compatibility
export type { BatchProcessorOptions, BatchResult, LogLevel } from "@/types/batch-processing";

/**
 * Generic batch processor that handles memory pressure, rate limiting, and retries
 */
export class BatchProcessor<T, R> {
  private scheduler: MemoryAwareRequestScheduler;
  private memoryMonitor: MemoryHealthMonitor;

  constructor(
    private name: string,
    private processor: (item: T) => Promise<R>,
    private options: BatchProcessorOptions<T> = {},
  ) {
    this.scheduler = new MemoryAwareRequestScheduler({
      maxConcurrentRequests: options.batchSize || 10,
      memoryThresholdPercent: (options.memoryThreshold ?? 0.85) * 100,
      maxQueueSize: 1000,
    });

    this.memoryMonitor = new MemoryHealthMonitor();
  }

  /**
   * Process items in batches with all safety features
   */
  async processBatch(items: T[]): Promise<BatchResult<T, R>> {
    const startTime = getMonotonicTime();
    const successful = new Map<T, R>();
    const failed = new Map<T, Error>();
    const skipped: T[] = [];
    let memoryPressureEvents = 0;

    const {
      batchSize = 10,
      batchDelay = 500,
      rateLimitNamespace,
      onProgress,
      onItemError,
      debug,
      retryOptions = {},
    } = this.options;

    const total = items.length;
    let processed = 0;

    // Process in batches
    for (let i = 0; i < items.length; i += batchSize) {
      // Check memory before starting batch
      const health = this.memoryMonitor.getHealthStatus();
      if (health.status === "unhealthy") {
        if (debug) {
          debugLog(`[${this.name}] Skipping batch due to unhealthy memory status`, "warn");
        }
        skipped.push(...items.slice(i));
        memoryPressureEvents++;
        break;
      }

      const batch = items.slice(i, Math.min(i + batchSize, items.length));

      // Process batch items concurrently with monitoring
      const batchPromises = batch.map(async item => {
        try {
          // Rate limiting check
          if (rateLimitNamespace) {
            await waitForPermit(rateLimitNamespace, "batch-processor", {
              maxRequests: 100,
              windowMs: 60000, // 1 minute window
            });
          }

          // Process with retry logic
          const result = await monitoredAsync(
            null,
            `${this.name}-process`,
            async () => {
              return await retryWithOptions(() => this.processItem(item), {
                maxRetries: 3,
                baseDelay: 1000,
                maxBackoff: 10000,
                jitter: true,
                ...retryOptions,
                onRetry: (error: unknown, attempt: number) => {
                  if (debug) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    debugLog(`[${this.name}] Retry ${attempt} for item`, "warn", { error: errorMessage });
                  }
                },
              });
            },
            { timeoutMs: this.options.timeout },
          );

          if (result !== null) {
            successful.set(item, result);
          }
        } catch (error: unknown) {
          const err = error instanceof Error ? error : new Error(String(error));
          failed.set(item, err);

          if (onItemError) {
            onItemError(item, err);
          }

          if (debug) {
            debugLog(`[${this.name}] Failed to process item`, "error", {
              error: err.message,
            });
          }
        }
      });

      // Wait for batch to complete
      await Promise.all(batchPromises);

      processed = Math.min(i + batchSize, total);

      // Report progress
      if (onProgress) {
        onProgress(processed, total, failed.size);
      }

      if (debug) {
        debugLog(`[${this.name}] Progress: ${processed}/${total}`, "info");
      }

      // Delay between batches (skip on last batch)
      if (i + batchSize < items.length) {
        await new Promise(resolve => setTimeout(resolve, batchDelay));
      }
    }

    return {
      successful,
      failed,
      skipped,
      totalTime: getMonotonicTime() - startTime,
      memoryPressureEvents,
    };
  }

  /**
   * Process a single item with memory-aware scheduling
   */
  private async processItem(item: T): Promise<R> {
    return await this.scheduler.scheduleRequest(async () => this.processor(item), RequestPriority.NORMAL, 3);
  }

  /**
   * Get current queue status
   */
  getStatus() {
    return {
      scheduler: this.scheduler.getMetrics(),
      memory: this.memoryMonitor.getHealthStatus(),
    };
  }
}

/**
 * Specialized batch processor for image operations
 */
export class ImageBatchProcessor<T extends { url: string }> extends BatchProcessor<T, Buffer> {
  constructor(name: string, fetchImage: (item: T) => Promise<Buffer>, options: BatchProcessorOptions<T> = {}) {
    super(name, fetchImage, {
      // Image-specific defaults
      batchSize: 5, // Lower concurrency for image ops
      memoryThreshold: 0.75, // More conservative memory threshold
      timeout: 30000, // 30s timeout for image fetches
      ...options,
    });
  }
}

/**
 * Helper to create a batch processor with S3 operations
 */
export function createS3BatchProcessor<T, R>(
  name: string,
  processor: (item: T) => Promise<R>,
  options: BatchProcessorOptions<T> = {},
): BatchProcessor<T, R> {
  return new BatchProcessor(name, processor, {
    // S3-specific defaults
    rateLimitNamespace: "s3-operations",
    retryOptions: {
      isRetryable: (error: unknown) => {
        // Retry on S3 throttling or network errors
        const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
        return message.includes("throttl") || message.includes("timeout") || message.includes("network");
      },
    },
    ...options,
  });
}

/**
 * Progress reporter utility
 */
export class BatchProgressReporter {
  private lastReportTime = 0;
  private reportInterval: number;

  constructor(
    private name: string,
    reportIntervalMs = 5000, // Report every 5 seconds by default
  ) {
    this.reportInterval = reportIntervalMs;
  }

  createProgressHandler(logLevel: LogLevel = "info") {
    return (current: number, total: number, failed: number) => {
      const now = getMonotonicTime();
      const shouldReport =
        current === total || // Always report completion
        now - this.lastReportTime >= this.reportInterval; // Or on interval

      if (shouldReport) {
        const percent = Math.round((current / total) * 100);
        const status = failed > 0 ? `(${failed} failed)` : "";

        debugLog(`[${this.name}] Progress: ${current}/${total} (${percent}%) ${status}`, logLevel);

        this.lastReportTime = now;
      }
    };
  }
}
