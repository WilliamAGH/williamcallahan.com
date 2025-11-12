/**
 * Async Operations Monitor
 *
 * Provides monitoring and management for all async operations in the application
 * to ensure they don't block server startup or cause performance issues.
 */

import type { MonitoredAsyncOperation } from "@/types/lib";
import { getMonotonicTime } from "@/lib/utils";

class AsyncOperationsMonitor {
  private operations: Map<string, MonitoredAsyncOperation> = new Map();
  private timeouts: Map<string, NodeJS.Timeout> = new Map();
  private readonly maxOperations = 1000; // Prevent unbounded growth
  private cleanupInterval: NodeJS.Timeout | null = null;
  private sequenceCounter = 0;

  constructor() {
    // Automatically clean up completed operations every 5 minutes
    this.cleanupInterval = setInterval(
      () => {
        this.clearCompleted();
        // Also enforce max size
        if (this.operations.size > this.maxOperations) {
          this.pruneOldOperations();
        }
      },
      5 * 60 * 1000,
    ); // 5 minutes

    // Don't prevent process from exiting
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Start tracking an async operation
   */
  startOperation(id: string, name: string, metadata?: Record<string, unknown>): void {
    this.operations.set(id, {
      name,
      startTime: getMonotonicTime(),
      status: "pending",
      metadata,
    });
  }

  /**
   * Mark an operation as completed
   */
  completeOperation(id: string): void {
    const operation = this.operations.get(id);
    if (operation) {
      operation.endTime = getMonotonicTime();
      operation.status = "completed";
      const duration = operation.endTime - operation.startTime;
      console.log(`[AsyncMonitor] Operation "${operation.name}" completed in ${duration}ms`);
    }
    this.clearTimeout(id);
  }

  /**
   * Mark an operation as failed
   */
  failOperation(id: string, error: Error, status: "failed" | "timeout" = "failed"): void {
    const operation = this.operations.get(id);
    if (operation) {
      operation.endTime = getMonotonicTime();
      operation.status = status;
      operation.error = error.message;
      const duration = operation.endTime - operation.startTime;
      const statusText = status === "timeout" ? "timed out" : "failed";
      console.error(`[AsyncMonitor] Operation "${operation.name}" ${statusText} after ${duration}ms:`, error.message);
    }
    this.clearTimeout(id);
  }

  /**
   * Generate a unique operation ID
   */
  generateId(): string {
    // Use monotonic timestamp + deterministic counter to avoid Math.random()
    const timestamp = Math.floor(getMonotonicTime());
    this.sequenceCounter = (this.sequenceCounter + 1) % Number.MAX_SAFE_INTEGER;
    const counterSegment = this.sequenceCounter.toString(36);
    return `op-${timestamp}-${counterSegment}`;
  }

  /**
   * Clear a timeout
   */
  private clearTimeout(id: string): void {
    const timeout = this.timeouts.get(id);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(id);
    }
  }

  /**
   * Get all operations
   */
  getOperations(): MonitoredAsyncOperation[] {
    return Array.from(this.operations.values());
  }

  /**
   * Get a single operation by its ID
   */
  getOperation(id: string): MonitoredAsyncOperation | undefined {
    return this.operations.get(id);
  }

  /**
   * Get operations by status
   */
  getOperationsByStatus(status: MonitoredAsyncOperation["status"]): MonitoredAsyncOperation[] {
    return this.getOperations().filter(op => op.status === status);
  }

  /**
   * Get operation summary
   */
  getSummary(): {
    total: number;
    pending: number;
    completed: number;
    failed: number;
    timeout: number;
    averageDuration: number;
  } {
    const operations = this.getOperations();
    const completed = operations.filter(op => op.status === "completed" && op.endTime);

    const totalDuration = completed.reduce((sum, op) => {
      if (op.endTime !== undefined) {
        return sum + (op.endTime - op.startTime);
      }
      return sum;
    }, 0);

    return {
      total: operations.length,
      pending: operations.filter(op => op.status === "pending").length,
      completed: completed.length,
      failed: operations.filter(op => op.status === "failed").length,
      timeout: operations.filter(op => op.status === "timeout").length,
      averageDuration: completed.length > 0 ? Math.round(totalDuration / completed.length) : 0,
    };
  }

  /**
   * Log current status
   */
  logStatus(): void {
    const summary = this.getSummary();
    console.log("[AsyncMonitor] Status:", {
      ...summary,
      averageDuration: `${summary.averageDuration}ms`,
    });

    const pending = this.getOperationsByStatus("pending");
    if (pending.length > 0) {
      console.log(
        "[AsyncMonitor] Pending operations:",
        pending.map(op => ({
          name: op.name,
          duration: `${getMonotonicTime() - op.startTime}ms`,
        })),
      );
    }
  }

  /**
   * Clear all completed operations (for memory management)
   */
  clearCompleted(): void {
    const completed = this.getOperationsByStatus("completed");
    for (const op of completed) {
      const entry = Array.from(this.operations.entries()).find(([, value]) => value === op);
      if (entry) {
        const [id] = entry;
        this.operations.delete(id);
      }
    }
  }

  /**
   * Prune old operations when we exceed max size
   */
  private pruneOldOperations(): void {
    // Sort by start time and keep only the most recent
    const sortedEntries = Array.from(this.operations.entries())
      .toSorted(([, a], [, b]) => b.startTime - a.startTime)
      .slice(0, Math.floor(this.maxOperations * 0.8)); // Keep 80% of max

    this.operations.clear();
    for (const [id, op] of sortedEntries) {
      this.operations.set(id, op);
    }

    console.warn(
      `[AsyncMonitor] Pruned operations map to prevent memory leak. Kept ${this.operations.size} most recent operations.`,
    );
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Clear all timeouts
    for (const timeout of this.timeouts.values()) {
      clearTimeout(timeout);
    }
    this.timeouts.clear();

    // Clear all operations
    this.operations.clear();
  }

  /**
   * Get health status (alias for getSummary for compatibility)
   */
  getHealthStatus(): {
    activeOperations: number;
    completedOperations: number;
    failedOperations: number;
    totalOperations: number;
  } {
    const summary = this.getSummary();
    return {
      activeOperations: summary.pending,
      completedOperations: summary.completed,
      failedOperations: summary.failed + summary.timeout,
      totalOperations: summary.total,
    };
  }
}

// Export singleton instance
export const asyncMonitor = new AsyncOperationsMonitor();

/**
 * Utility function to wrap an async operation with monitoring
 */
export async function monitoredAsync<T>(
  id: string | null,
  name: string,
  operation: () => Promise<T>,
  options: {
    timeoutMs?: number;
    metadata?: Record<string, unknown>;
  } = {},
): Promise<T> {
  // Generate ID if not provided
  const operationId = id || asyncMonitor.generateId();
  asyncMonitor.startOperation(operationId, name, options.metadata);

  let timeoutId: NodeJS.Timeout | undefined;

  try {
    const operationPromise = operation();

    if (options.timeoutMs) {
      // Create a timeout promise that rejects after the specified time
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          const error = new Error(`Operation "${name}" timed out after ${options.timeoutMs}ms`);
          asyncMonitor.failOperation(operationId, error, "timeout");
          reject(error);
        }, options.timeoutMs);
      });

      // Race the operation against the timeout
      const result = await Promise.race([operationPromise, timeoutPromise]);

      // Clear the timeout if operation completed first
      if (timeoutId) clearTimeout(timeoutId);

      asyncMonitor.completeOperation(operationId);
      return result;
    }

    // No timeout, just await the operation
    const result = await operationPromise;
    asyncMonitor.completeOperation(operationId);
    return result;
  } catch (error) {
    // Clear any pending timeout
    if (timeoutId) clearTimeout(timeoutId);

    // Use atomic check-and-set to avoid race conditions
    const operation = asyncMonitor.getOperation(operationId);
    if (operation && operation.status === "pending") {
      asyncMonitor.failOperation(operationId, error as Error);
    }
    throw error;
  }
}

/**
 * Create a non-blocking async operation that won't prevent server startup
 */
export function nonBlockingAsync<T>(
  id: string,
  name: string,
  operation: () => Promise<T>,
  options: {
    timeoutMs?: number;
    metadata?: Record<string, unknown>;
    onError?: (error: Error) => void;
  } = {},
): void {
  // Use setImmediate to ensure this doesn't block the event loop
  setImmediate(() => {
    // Handle the promise without making the callback async
    monitoredAsync(id, name, operation, {
      timeoutMs: options.timeoutMs,
      metadata: options.metadata,
    }).catch(error => {
      if (options.onError) {
        options.onError(error as Error);
      } else {
        console.error(`[AsyncMonitor] Non-blocking operation "${name}" failed:`, error);
      }
    });
  });
}

// Periodically clean up completed operations to prevent memory leak.
// The cleanup timer should only run in the long-lived Node.js runtime; the
// Edge runtime spins up a fresh isolate per request, so a timer is unnecessary
// and `.unref()` is not available (setInterval returns a number, not a Timeout).

if (typeof process !== "undefined" && process.env?.NEXT_RUNTIME === "nodejs") {
  const cleanupInterval = process.env.NODE_ENV === "production" ? 60_000 : 30_000; // 1 min prod, 30 s dev

  const timer = setInterval(() => {
    const summary = asyncMonitor.getSummary();
    if (summary.total > 0) {
      // Only log in development
      if (process.env.NODE_ENV === "development") {
        asyncMonitor.logStatus();
      }
      // Always clear completed operations to prevent memory leak
      asyncMonitor.clearCompleted();
    }
  }, cleanupInterval);

  // Prevent the timer from keeping the event loop alive in Node
  if ("unref" in timer && typeof timer.unref === "function") {
    timer.unref();
  }
}
