/**
 * @file Type definitions for services like schedulers and monitors.
 * @module types/services
 */

/**
 * Represents a request that has been scheduled for execution.
 */
export interface ScheduledRequest {
  id: string;
  priority: RequestPriority;
  operation: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timestamp: number;
  retries: number;
  maxRetries: number;
}

/**
 * Defines the priority levels for scheduled requests.
 */
export enum RequestPriority {
  CRITICAL = 0, // Health checks, essential operations
  HIGH = 1, // Cache hits, fast operations
  NORMAL = 2, // Regular requests
  LOW = 3, // Background operations, prefetching
}

/**
 * Defines the structure for scheduler performance metrics.
 */
export interface SchedulerMetrics {
  queueSize: number;
  activeRequests: number;
  totalProcessed: number;
  totalRejected: number;
  averageWaitTime: number;
  memoryPressureActivations: number;
}
