/**
 * Error and API Response Types
 *
 * SCOPE: Core error types and generic API response structures.
 * This file defines the fundamental shapes for handling errors and API communication
 * across the application.
 *
 * === INCLUSION RULES ===
 * ✅ DO ADD:
 *   - Base error interfaces (e.g., Error, ExtendedError)
 *   - Generic API response wrappers (e.g., ApiResponse, ErrorResponse)
 *   - Type guards for core error types.
 *
 * === EXCLUSION RULES ===
 * ❌ DO NOT ADD:
 *   - Domain-specific errors (→ e.g., types/bookmark.ts for BookmarkError)
 *   - Runtime utility functions (→ lib/utils/error-utils.ts)
 *   - Component-specific error props (→ e.g., types/ui/boundaries.ts)
 *
 * @see lib/utils/error-utils.ts for runtime error handling helpers
 * @see types/bookmark.ts for domain-specific bookmark errors
 * @see types/github.ts for domain-specific GitHub errors
 */

import { z } from "zod";

/**
 * Extended Error interface for application-specific errors
 */
export interface ExtendedError extends Error {
  /** Timestamp of when the data was last successfully fetched */
  lastFetched?: number;
  /** Timestamp of the last fetch attempt */
  lastFetchedTimestamp?: number;
  /** Error code for categorizing the error type */
  code?: string;
  /** Additional context data for the error */
  context?: Record<string, unknown>;
}

/**
 * AWS SDK Error interface with metadata
 */
export interface AWSError extends Error {
  /** AWS SDK metadata containing HTTP status codes and other info */
  $metadata?: {
    httpStatusCode?: number;
  };
}

// Deprecated error interfaces removed - use specific error types from their domain modules:
// - BookmarkError from types/bookmark.ts
// - GitHubActivityError from types/github.ts

/**
 * Type guard to check if an error has the lastFetched property
 */
export function hasLastFetched(error: unknown): error is ExtendedError & { lastFetched: number } {
  return (
    typeof error === "object" &&
    error !== null &&
    "lastFetched" in error &&
    typeof (error as ExtendedError).lastFetched === "number"
  );
}

/**
 * Type guard to check if an error has the lastFetchedTimestamp property
 */
export function hasLastFetchedTimestamp(error: unknown): error is ExtendedError & { lastFetchedTimestamp: number } {
  return (
    typeof error === "object" &&
    error !== null &&
    "lastFetchedTimestamp" in error &&
    typeof (error as ExtendedError).lastFetchedTimestamp === "number"
  );
}

/**
 * Utility function to safely extract error message
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "An unknown error occurred";
}

/**
 * Utility function to safely extract timestamp from error
 */
export function getErrorTimestamp(
  error: unknown,
  property: "lastFetched" | "lastFetchedTimestamp",
): number | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    property in error &&
    typeof (error as Record<string, unknown>)[property] === "number"
  ) {
    return (error as Record<string, number>)[property];
  }
  return undefined;
}

/**
 * Payload for client-side errors logged to the server.
 * @usage - API endpoint for /api/log-client-error
 */
export interface ClientErrorPayload {
  message?: string;
  resource?: string; // e.g., script URL if it's a script error
  type?: string; // e.g., 'ChunkLoadError', 'TypeError'
  url?: string; // The URL where the error occurred
  stack?: string;
  buildId?: string; // Next.js build ID
  // Allow other properties that might be sent from various client-side error sources
  [key: string]: unknown; // Use unknown instead of any for better type safety
}

// Zod schema moved from app/api/log-client-error/route.ts
export const ClientErrorSchema = z
  .object({
    message: z.string().optional(),
    resource: z.string().optional(), // e.g., script URL if it's a script error
    type: z.string().optional(), // e.g., 'ChunkLoadError', 'TypeError'
    url: z.string().optional(), // The URL where the error occurred
    stack: z.string().optional(),
    buildId: z.string().optional(), // Next.js build ID
  })
  .passthrough(); // Allows other properties, matching [key: string]: unknown;

export interface ErrorWithCode {
  code: string;
}

export interface ErrorWithStatusCode {
  statusCode: number;
}

// =============================================================================
// ERROR CATEGORIZATION TYPES
// =============================================================================

export enum ErrorCategory {
  NETWORK = "network",
  HTTP = "http",
  S3 = "s3",
  GITHUB_API = "github_api",
  AI_PROVIDER = "ai_provider",
  SEARCH_PROVIDER = "search_provider",
  RATE_LIMIT = "rate_limit",
  MEMORY_PRESSURE = "memory_pressure",
  TIMEOUT = "timeout",
  /** User-initiated abort (DOMException AbortError) - should NOT be retried */
  ABORT = "abort",
  VALIDATION = "validation",
  SYSTEM = "system",
  UNKNOWN = "unknown",
}

export enum ErrorSeverity {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

export interface CategorizedError extends Error {
  category: ErrorCategory;
  severity: ErrorSeverity;
  isRetryable: boolean;
  context?: Record<string, unknown>;
  originalError?: unknown;
  statusCode?: number;
}

// =============================================================================
// ERROR COMPONENT & PAGE TYPES
// =============================================================================

/**
 * Props for global error handlers
 */
export interface GlobalErrorProps {
  /** The error that occurred with optional digest */
  error: Error & { digest?: string };
}

/**
 * Props for error boundaries that handle component-level errors
 */
export interface ErrorBoundaryComponentProps {
  /** The error that occurred */
  error: Error;
  /** Function to reset the error boundary */
  reset: () => void;
}

// Re-export UI boundary types for convenience
export type { ErrorBoundaryProps, ErrorBoundaryState, LocalErrorBoundaryProps } from "@/types/ui/boundaries";

// Generic error/response interfaces removed - use specific response types from API modules
