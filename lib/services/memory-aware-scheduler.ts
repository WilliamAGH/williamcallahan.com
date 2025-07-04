/**
 * Memory-Aware Request Scheduler
 *
 * Coordinates request processing based on memory availability:
 * - Monitors current memory usage before processing requests
 * - Queues requests when memory usage > 60% of budget
 * - Implements request prioritization (cache hits > new fetches)
 * - Exponential backoff for memory pressure situations
 * - Integrates with existing memory monitoring systems
 *
 * @module lib/services/memory-aware-scheduler
 */

import { EventEmitter } from "node:events";
import { getMemoryHealthMonitor } from "@/lib/health/memory-health-monitor";
import { MEMORY_THRESHOLDS } from "@/lib/constants";
import type { ScheduledRequest, SchedulerMetrics } from "@/types/services";
import { RequestPriority } from "@/types/services";

/**
 * Memory-aware request scheduler that queues and prioritizes requests
 * based on current memory usage and pressure conditions.
 */
export class MemoryAwareRequestScheduler extends EventEmitter {
  private readonly requestQueue: ScheduledRequest[] = [];
  private readonly activeRequests = new Set<string>();
  private readonly memoryHealthMonitor = getMemoryHealthMonitor();

  private readonly maxQueueSize: number;
  private readonly maxConcurrentRequests: number;
  private readonly memoryThresholdPercent: number;
  private readonly backoffBase: number;
  private readonly maxBackoffMs: number;

  private isProcessing = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private requestIdCounter = 0;

  // Metrics
  private totalProcessed = 0;
  private totalRejected = 0;
  private memoryPressureActivations = 0;
  private waitTimes: number[] = [];

  // External event listener references for cleanup
  private statusChangedHandler?: (data: { status: string; data?: unknown }) => void;
  private memoryPressureHandler?: (data: import("@/types/health").MemoryPressureEvent) => void;
  private memoryCriticalHandler?: () => void;

  constructor(
    options: {
      maxQueueSize?: number;
      maxConcurrentRequests?: number;
      memoryThresholdPercent?: number;
      backoffBase?: number;
      maxBackoffMs?: number;
    } = {},
  ) {
    super();

    this.maxQueueSize = options.maxQueueSize ?? 1000;
    this.maxConcurrentRequests = options.maxConcurrentRequests ?? 10;
    this.memoryThresholdPercent = options.memoryThresholdPercent ?? 60;
    this.backoffBase = options.backoffBase ?? 100;
    this.maxBackoffMs = options.maxBackoffMs ?? 30000;

    this.startProcessing();
    this.setupMemoryMonitoring();
  }

  /**
   * Schedule a request with specified priority
   */
  async scheduleRequest<T>(
    operation: () => Promise<T>,
    priority: RequestPriority = RequestPriority.NORMAL,
    maxRetries = 3,
  ): Promise<T> {
    // Check queue size limits
    if (this.requestQueue.length >= this.maxQueueSize) {
      this.totalRejected++;
      this.emit("request-rejected", { reason: "queue-full", queueSize: this.requestQueue.length });
      throw new Error("Request queue full - system overloaded");
    }

    const requestId = `req-${++this.requestIdCounter}`;
    const timestamp = Date.now();

    return new Promise<T>((resolve, reject) => {
      const scheduledRequest: ScheduledRequest = {
        id: requestId,
        priority,
        operation: () => operation() as Promise<unknown>,
        resolve: (value: unknown) => resolve(value as T),
        reject,
        timestamp,
        retries: 0,
        maxRetries,
      };

      // Insert based on priority (lower numbers = higher priority)
      const insertIndex = this.findInsertionIndex(priority);
      this.requestQueue.splice(insertIndex, 0, scheduledRequest);

      this.emit("request-queued", {
        id: requestId,
        priority,
        queueSize: this.requestQueue.length,
        insertIndex,
      });
    });
  }

  /**
   * Get current scheduler metrics
   */
  getMetrics(): SchedulerMetrics {
    const avgWaitTime =
      this.waitTimes.length > 0 ? this.waitTimes.reduce((sum, time) => sum + time, 0) / this.waitTimes.length : 0;

    return {
      queueSize: this.requestQueue.length,
      activeRequests: this.activeRequests.size,
      totalProcessed: this.totalProcessed,
      totalRejected: this.totalRejected,
      averageWaitTime: avgWaitTime,
      memoryPressureActivations: this.memoryPressureActivations,
    };
  }

  /**
   * Check if scheduler should accept new requests
   */
  shouldAcceptRequests(): boolean {
    const memoryStatus = this.memoryHealthMonitor.getCurrentStatus();

    // Don't accept new requests if memory critical or queue too full
    return memoryStatus !== "critical" && this.requestQueue.length < this.maxQueueSize * 0.9;
  }

  /**
   * Get current memory usage as percentage of budget
   */
  private getCurrentMemoryUsagePercent(): number {
    const usage = process.memoryUsage();
    const budget = MEMORY_THRESHOLDS.TOTAL_PROCESS_MEMORY_BUDGET_BYTES;
    return (usage.rss / budget) * 100;
  }

  /**
   * Find insertion index for priority-based queueing
   */
  private findInsertionIndex(priority: RequestPriority): number {
    for (let i = 0; i < this.requestQueue.length; i++) {
      const request = this.requestQueue[i];
      if (request?.priority !== undefined && request.priority > priority) {
        return i;
      }
    }
    return this.requestQueue.length;
  }

  /**
   * Start request processing loop
   */
  private startProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }

    this.processingInterval = setInterval(() => {
      this.processQueue().catch((error) => {
        console.error("[MemoryScheduler] Error in processing loop:", error);
      });
    }, 100); // Check every 100ms
    
    // Don't prevent process from exiting
    if (this.processingInterval.unref) {
      this.processingInterval.unref();
    }
  }

  /**
   * Process queued requests based on memory availability
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.requestQueue.length === 0) {
      return;
    }

    if (this.activeRequests.size >= this.maxConcurrentRequests) {
      return;
    }

    const memoryUsage = this.getCurrentMemoryUsagePercent();
    const memoryStatus = this.memoryHealthMonitor.getCurrentStatus();

    // Skip processing if memory pressure is high
    if (memoryUsage > this.memoryThresholdPercent || memoryStatus === "critical") {
      this.memoryPressureActivations++;
      this.emit("memory-pressure-throttle", { memoryUsage, memoryStatus });

      // Apply exponential backoff during memory pressure
      const backoffMs = Math.min(this.backoffBase * 2 ** (this.memoryPressureActivations % 10), this.maxBackoffMs);

      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      return;
    }

    this.isProcessing = true;

    try {
      // Process highest priority requests first
      const request = this.requestQueue.shift();
      if (!request) {
        this.isProcessing = false;
        return;
      }

      this.activeRequests.add(request.id);

      const startTime = Date.now();
      const waitTime = startTime - request.timestamp;
      this.waitTimes.push(waitTime);

      // Keep only recent wait times for averaging
      if (this.waitTimes.length > 100) {
        this.waitTimes.splice(0, this.waitTimes.length - 100);
      }

      this.emit("request-processing", {
        id: request.id,
        priority: request.priority,
        waitTime,
        memoryUsage,
      });

      try {
        const result = await request.operation();
        request.resolve(result);
        this.totalProcessed++;

        const processingTime = Date.now() - startTime;
        this.emit("request-completed", {
          id: request.id,
          processingTime,
          success: true,
        });
      } catch (error) {
        const processingError = error instanceof Error ? error : new Error(String(error));

        // Retry if possible
        if (request.retries < request.maxRetries) {
          request.retries++;
          const retryDelay = this.backoffBase * 2 ** request.retries;

          setTimeout(() => {
            const insertIndex = this.findInsertionIndex(request.priority);
            this.requestQueue.splice(insertIndex, 0, request);
          }, retryDelay);

          this.emit("request-retry", {
            id: request.id,
            retries: request.retries,
            maxRetries: request.maxRetries,
            retryDelay,
          });
        } else {
          request.reject(processingError);
          this.totalRejected++;

          this.emit("request-failed", {
            id: request.id,
            error: processingError.message,
            retries: request.retries,
          });
        }
      } finally {
        this.activeRequests.delete(request.id);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Setup memory monitoring integration
   */
  private setupMemoryMonitoring(): void {
    this.statusChangedHandler = ({ status }) => {
      if (status === "critical") {
        // Cancel low priority requests during critical memory pressure
        this.cancelLowPriorityRequests();
      }
    };
    this.memoryHealthMonitor.on("status-changed", this.statusChangedHandler);
  }

  /**
   * Cancel low-priority requests during critical memory pressure
   */
  private cancelLowPriorityRequests(): void {
    const lowPriorityRequests: ScheduledRequest[] = [];
    // Iterate backwards to safely remove items
    for (let i = this.requestQueue.length - 1; i >= 0; i--) {
      const request = this.requestQueue[i];
      if (request && request.priority >= RequestPriority.NORMAL) {
        lowPriorityRequests.push(request);
        this.requestQueue.splice(i, 1);
      }
    }

    for (const request of lowPriorityRequests) {
      if (request) {
        request.reject(new Error("Request canceled due to critical memory pressure"));
        this.emit("request-canceled", { id: request.id });
      }
    }

    if (lowPriorityRequests.length > 0) {
      this.emit("critical-memory-cancellation", {
        source: "MemoryAwareScheduler",
        canceledCount: lowPriorityRequests.length,
      });
    }
  }

  /**
   * Shutdown scheduler
   */
  shutdown(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    // Remove external listeners to prevent memory leaks
    if (this.statusChangedHandler) {
      this.memoryHealthMonitor.off("status-changed", this.statusChangedHandler);
      this.statusChangedHandler = undefined;
    }

    // Reject all pending requests
    for (const request of this.requestQueue) {
      request.reject(new Error("Scheduler shutting down"));
    }
    this.requestQueue.length = 0;

    this.removeAllListeners();
  }
}

// Singleton instance
export const memoryAwareScheduler = new MemoryAwareRequestScheduler();
