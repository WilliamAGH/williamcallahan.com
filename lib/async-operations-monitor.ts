/**
 * Async Operations Monitor
 *
 * Provides monitoring and management for all async operations in the application
 * to ensure they don't block server startup or cause performance issues.
 */

import type { MonitoredAsyncOperation } from "@/types/lib";

class AsyncOperationsMonitor {
  private operations: Map<string, MonitoredAsyncOperation> = new Map();
  private timeouts: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Start tracking an async operation
   */
  startOperation(id: string, name: string, metadata?: Record<string, unknown>): void {
    this.operations.set(id, {
      name,
      startTime: Date.now(),
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
      operation.endTime = Date.now();
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
      operation.endTime = Date.now();
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
    // Use timestamp + random for uniqueness without external dependencies
    return `op-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
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
    return this.getOperations().filter((op) => op.status === status);
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
    const completed = operations.filter((op) => op.status === "completed" && op.endTime);

    const totalDuration = completed.reduce((sum, op) => {
      if (op.endTime !== undefined) {
        return sum + (op.endTime - op.startTime);
      }
      return sum;
    }, 0);

    return {
      total: operations.length,
      pending: operations.filter((op) => op.status === "pending").length,
      completed: completed.length,
      failed: operations.filter((op) => op.status === "failed").length,
      timeout: operations.filter((op) => op.status === "timeout").length,
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
        pending.map((op) => ({
          name: op.name,
          duration: `${Date.now() - op.startTime}ms`,
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

    // Avoid double-logging if timeout already failed it
    const operation = asyncMonitor.getOperation(operationId);
    if (operation?.status !== "timeout") {
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
    }).catch((error) => {
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
