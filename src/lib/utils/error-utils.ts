/**
 * Unified Error Utilities
 *
 * This is the SINGLE source of truth for all error handling in the application.
 * Consolidates error classes, utilities, categorization, and type guards.
 */
import { ErrorCategory, ErrorSeverity, type CategorizedError } from "@/types/error";
import { apiErrorResponseSchema } from "@/types/schemas/api";

// =============================================================================
// CUSTOM ERROR CLASSES
// =============================================================================

/**
 * Error for missing or invalid blog post data
 */
export class BlogPostDataError extends Error {
  code = "BLOG_POST_DATA_ERROR";
  slug?: string;

  constructor(message: string, slug?: string, cause?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.slug = slug;
    this.cause = cause;
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

export function getErrorMessage(error: unknown, fallback = "An unknown error occurred"): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  const result = apiErrorResponseSchema.safeParse(error);
  if (!result.success) return fallback;
  if (result.data.message !== undefined) return result.data.message;
  if (result.data.error !== undefined) return result.data.error;
  return fallback;
}

/**
 * Safely converts an unknown value to a string, avoiding "[object Object]".
 */
export function safeStringifyValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "undefined") return "undefined";
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    typeof value === "symbol"
  ) {
    return String(value);
  }
  if (typeof value === "function") {
    const funcStr = String(value);
    // Truncate long function strings
    const MAX_FUNC_PREVIEW_LENGTH = 100;
    return `Function: ${funcStr.substring(0, Math.min(funcStr.length, MAX_FUNC_PREVIEW_LENGTH))}${funcStr.length > MAX_FUNC_PREVIEW_LENGTH ? "..." : ""}`;
  }

  // For objects, try to access a 'message' property first
  // This is a common pattern for error-like objects
  if (typeof value === "object" && value !== null && "message" in value) {
    const message = Reflect.get(value, "message");
    if (typeof message === "string") return message;
  }

  // Then, attempt JSON.stringify
  try {
    return JSON.stringify(value);
  } catch {
    // Fallback for objects that cannot be stringified (e.g., circular references)
    let constructorName = "unknown type";
    if (
      typeof value === "object" &&
      value !== null &&
      value.constructor &&
      value.constructor.name
    ) {
      constructorName = value.constructor.name;
    }
    return `[Unstringifiable ${constructorName} value]`;
  }
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Safely gets a property from an error object if it exists.
 */
export function getProperty(error: unknown, property: string): number | undefined {
  if (typeof error !== "object" || error === null || !(property in error)) return undefined;
  const value = Reflect.get(error, property);
  return typeof value === "number" ? value : undefined;
}

// =============================================================================
// ERROR CATEGORIZATION AND RETRY LOGIC
// =============================================================================

/**
 * Determine if an error is retryable based on its type and message
 * Consolidates retry logic from http-client.ts, github-api.ts, lib/s3/*, etc.
 */
export function isRetryableError(error: unknown, domain?: string): boolean {
  const category = categorizeError(error, domain);

  switch (category) {
    case ErrorCategory.NETWORK:
    case ErrorCategory.TIMEOUT:
    case ErrorCategory.RATE_LIMIT:
    case ErrorCategory.MEMORY_PRESSURE:
      return true;

    case ErrorCategory.HTTP:
      return isRetryableHttpStatus(error);

    case ErrorCategory.S3:
      return isRetryableS3Error(error);

    case ErrorCategory.GITHUB_API:
      return isRetryableGitHubError(error);

    // User-initiated aborts should NEVER be retried
    case ErrorCategory.ABORT:
    case ErrorCategory.VALIDATION:
    case ErrorCategory.SYSTEM:
      return false;

    default:
      return false;
  }
}

/**
 * Categorize an error based on its characteristics and domain context
 */
export function categorizeError(error: unknown, domain?: string): ErrorCategory {
  if (!(error instanceof Error)) {
    return ErrorCategory.UNKNOWN;
  }

  // User-initiated abort (DOMException with AbortError) - NOT retryable
  // Must check BEFORE timeout to distinguish user cancellation from internal timeouts
  // See: openai-compatible-client.ts for the canonical pattern
  if (error instanceof DOMException && error.name === "AbortError") {
    return ErrorCategory.ABORT;
  }

  const message = error.message.toLowerCase();

  // Network-related errors
  if (
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("etimedout") ||
    message.includes("network") ||
    message.includes("fetch failed") ||
    message.includes("enotfound")
  ) {
    return ErrorCategory.NETWORK;
  }

  // Timeout errors (internal timeouts, NOT user-initiated aborts)
  if (message.includes("timeout") || message.includes("aborted") || error.name === "AbortError") {
    return ErrorCategory.TIMEOUT;
  }

  // Rate limiting
  if (
    message.includes("rate limit") ||
    message.includes("throttl") ||
    message.includes("429") ||
    message.includes("quota exceeded")
  ) {
    return ErrorCategory.RATE_LIMIT;
  }

  // Memory pressure
  if (
    message.includes("memory") ||
    message.includes("heap") ||
    message.includes("out of memory") ||
    message.includes("insufficient memory headroom")
  ) {
    return ErrorCategory.MEMORY_PRESSURE;
  }

  // HTTP status errors
  if (message.includes("http") || /\b[4-5]\d{2}\b/.test(message)) {
    return ErrorCategory.HTTP;
  }

  // Domain-specific categorization
  if (domain) {
    if (domain === "s3" && (message.includes("s3") || message.includes("nosuchkey"))) {
      return ErrorCategory.S3;
    }

    if (domain === "github" && message.includes("github")) {
      return ErrorCategory.GITHUB_API;
    }
  }

  return ErrorCategory.UNKNOWN;
}

/**
 * Check if HTTP status code is retryable
 */
function isRetryableHttpStatus(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message;
  return /\b5\d{2}\b/.test(message) || ["429", "408", "202"].some((code) => message.includes(code));
}

/**
 * Check if S3 error is retryable
 */
function isRetryableS3Error(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();

  // Transient S3 errors
  if (
    message.includes("throttl") ||
    message.includes("slowdown") ||
    message.includes("service unavailable") ||
    message.includes("internal error")
  ) {
    return true;
  }

  return false;
}

/**
 * Check if GitHub API error is retryable
 */
function isRetryableGitHubError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return ["403", "429", "202", "abuse detection"].some((term) => message.includes(term));
}

// =============================================================================
// ERROR TRANSFORMATION AND UTILITIES
// =============================================================================

/**
 * Convert unknown error to a standardized Error instance
 */
export function normalizeError(error: unknown, context?: Record<string, unknown>): Error {
  let normalizedError: Error;
  let normalizedContext = context;

  if (error instanceof Error) {
    normalizedError = error;
  } else if (typeof error === "object" && error !== null) {
    const message = "message" in error ? String(error.message) : "Unknown error";
    normalizedError = new Error(message);
    if (context) {
      normalizedContext = { ...context, originalError: error };
    }
  } else {
    normalizedError = new Error(String(error));
  }

  if (normalizedContext) {
    Object.assign(normalizedError, { context: normalizedContext });
  }
  return normalizedError;
}

/**
 * Create a categorized error with full metadata
 */
export function createCategorizedError(
  error: unknown,
  domain?: string,
  context?: Record<string, unknown>,
): CategorizedError {
  const normalizedError = normalizeError(error, context);
  const category = categorizeError(error, domain);
  const isRetryable = isRetryableError(error, domain);

  // Determine severity based on category and context
  let severity = ErrorSeverity.MEDIUM;
  if (category === ErrorCategory.MEMORY_PRESSURE || category === ErrorCategory.SYSTEM) {
    severity = ErrorSeverity.CRITICAL;
  } else if (category === ErrorCategory.RATE_LIMIT || category === ErrorCategory.TIMEOUT) {
    severity = ErrorSeverity.LOW;
  } else if (category === ErrorCategory.NETWORK) {
    severity = ErrorSeverity.HIGH;
  }

  const categorizedError = Object.assign(normalizedError, {
    category,
    severity,
    isRetryable,
    originalError: error,
  });
  if (context !== undefined) Object.assign(categorizedError, { context });

  // Extract status code if available
  if (typeof error === "object" && error !== null && "$metadata" in error) {
    const metadata = Reflect.get(error, "$metadata");
    if (typeof metadata === "object" && metadata !== null) {
      const statusCode = Reflect.get(metadata, "httpStatusCode");
      if (typeof statusCode === "number") Object.assign(categorizedError, { statusCode });
    }
  }

  return categorizedError satisfies CategorizedError;
}
