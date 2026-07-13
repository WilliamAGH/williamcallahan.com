/**
 * Error Types
 *
 * SCOPE: Core application error contracts with reusable semantics.
 * This file defines the fundamental shapes for handling errors across the application.
 *
 * === INCLUSION RULES ===
 * ✅ DO ADD:
 *   - Application error contracts with reusable semantics
 *
 * === EXCLUSION RULES ===
 * ❌ DO NOT ADD:
 *   - Generic API error or response contracts (→ types/schemas/api.ts)
 *   - Type aliases that only rename a core error interface
 *   - Runtime utility functions (→ lib/utils/error-utils.ts)
 *   - Component-specific error props (→ e.g., types/ui/boundaries.ts)
 *
 * @see lib/utils/error-utils.ts for runtime error handling helpers
 */

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
