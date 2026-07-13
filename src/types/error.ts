/**
 * Error Types
 *
 * SCOPE: Core error types and client-error reporting payloads.
 * This file defines the fundamental shapes for handling errors across the application.
 *
 * === INCLUSION RULES ===
 * ✅ DO ADD:
 *   - Base error interfaces (e.g., Error, ExtendedError)
 *   - Type guards for core error types.
 *
 * === EXCLUSION RULES ===
 * ❌ DO NOT ADD:
 *   - Generic API error or response contracts (→ types/schemas/api.ts)
 *   - Domain-specific errors (→ e.g., types/bookmark.ts for BookmarkError)
 *   - Runtime utility functions (→ lib/utils/error-utils.ts)
 *   - Component-specific error props (→ e.g., types/ui/boundaries.ts)
 *
 * @see lib/utils/error-utils.ts for runtime error handling helpers
 * @see types/bookmark.ts for domain-specific bookmark errors
 * @see types/github.ts for domain-specific GitHub errors
 */

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
