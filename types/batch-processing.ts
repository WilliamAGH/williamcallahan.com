/**
 * Batch Processing Type Definitions
 */

import type { RetryConfig } from "@/types/lib";

export type LogLevel = "info" | "warn" | "error";

export interface BatchProcessorOptions<T> {
  /** Batch size for concurrent processing */
  batchSize?: number;
  /** Delay between batches in ms */
  batchDelay?: number;
  /** Rate limit namespace */
  rateLimitNamespace?: string;
  /** Progress callback */
  onProgress?: (current: number, total: number, failed: number) => void;
  /** Error callback for individual items */
  onItemError?: (item: T, error: Error) => void;
  /** Memory pressure threshold (0-1) */
  memoryThreshold?: number;
  /** Operation timeout in ms */
  timeout?: number;
  /** Retry options for failed items */
  retryOptions?: Partial<RetryConfig>;
  /** Debug logging */
  debug?: boolean;
}

export interface BatchResult<T, R> {
  successful: Map<T, R>;
  failed: Map<T, Error>;
  skipped: T[];
  totalTime: number;
  memoryPressureEvents: number;
}
