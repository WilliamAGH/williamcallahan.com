/**
 * Unified Error Utilities
 *
 * This is the SINGLE source of truth for all error handling in the application.
 * Consolidates error classes, utilities, categorization, and type guards.
 */
import {
  ErrorCategory,
  ErrorSeverity,
  type ExtendedError,
  type ErrorWithCode,
  type ErrorWithStatusCode,
  type CategorizedError,
} from "@/types/error";

// =============================================================================
// CUSTOM ERROR CLASSES
// =============================================================================

/**
 * Base class for application errors
 * Allows for structured error handling with error codes
 */
export class AppError extends Error {
  code: string;

  constructor(message: string, code: string, cause?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.cause = cause;
  }
}

/**
 * Specific error for MDX processing issues
 */
export class MDXProcessingError extends AppError {
  filePath?: string;

  constructor(message: string, filePath?: string, cause?: unknown) {
    super(message, "MDX_PROCESSING_ERROR", cause);
    this.filePath = filePath;
  }
}

/**
 * Error for issues with reading files
 */
export class FileAccessError extends AppError {
  filePath: string;

  constructor(message: string, filePath: string, cause?: unknown) {
    super(message, "FILE_ACCESS_ERROR", cause);
    this.filePath = filePath;
  }
}

/**
 * Error for issues with parsing frontmatter
 */
export class FrontmatterError extends AppError {
  filePath: string;

  constructor(message: string, filePath: string, cause?: unknown) {
    super(message, "FRONTMATTER_ERROR", cause);
    this.filePath = filePath;
  }
}

/**
 * Error for missing or invalid blog post data
 */
export class BlogPostDataError extends AppError {
  slug?: string;

  constructor(message: string, slug?: string, cause?: unknown) {
    super(message, "BLOG_POST_DATA_ERROR", cause);
    this.slug = slug;
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

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
    return `Function: ${funcStr.substring(0, Math.min(funcStr.length, 100))}${funcStr.length > 100 ? "..." : ""}`;
  }

  // For objects, try to access a 'message' property first
  // This is a common pattern for error-like objects
  if (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof (value as { message: unknown }).message === "string"
  ) {
    return (value as { message: string }).message;
  }

  // Then, attempt JSON.stringify
  try {
    return JSON.stringify(value);
  } catch {
    // Fallback for objects that cannot be stringified (e.g., circular references)
    let constructorName = "unknown type";
    if (typeof value === "object" && value !== null && value.constructor && value.constructor.name) {
      constructorName = value.constructor.name;
    }
    return `[Unstringifiable ${constructorName} value]`;
  }
}

/**
 * Utility function to wrap errors with more context
 */
export function wrapError<T extends Error>(
  message: string,
  error: unknown,
  factory: (msg: string, cause?: unknown) => T,
): T {
  // Determine the cause: if the original error is an Error instance, use it.
  // Otherwise, wrap non-Error values by stringifying them so they're not lost.
  let cause: Error | undefined;
  if (error instanceof Error) {
    cause = error;
  } else if (typeof error !== "undefined") {
    cause = new Error(safeStringifyValue(error));
  } else {
    // cause remains undefined if error is undefined
  }

  // Create the new error using the provided factory function.
  const newError = factory(message, cause);

  // If the original error was an AppError with a code, and the newError is also an AppError,
  // preserve the original code if the newError doesn't have one set by the factory.
  if (error instanceof AppError && newError instanceof AppError && error.code && !newError.code) {
    (newError as AppError).code = error.code;
  }

  return newError;
}

/**
 * Check if an error is of a specific custom error type
 */
export function isErrorOfType<T extends Error>(error: unknown, errorType: new (...args: unknown[]) => T): error is T {
  return error instanceof errorType;
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Type guard to check if an error is an object with a 'code' property.
 */
export function isErrorWithCode(error: unknown): error is ErrorWithCode {
  return typeof error === "object" && error !== null && "code" in error;
}

/**
 * Type guard to check if an error is an object with a 'statusCode' property.
 */
export function isErrorWithStatusCode(error: unknown): error is ErrorWithStatusCode {
  return typeof error === "object" && error !== null && "statusCode" in error;
}

/**
 * Safely gets a property from an error object if it exists.
 */
export function getProperty(error: ExtendedError, property: string): number | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    property in error &&
    typeof (error as unknown as Record<string, unknown>)[property] === "number"
  ) {
    return (error as unknown as Record<string, number>)[property];
  }
  return undefined;
}

// =============================================================================
// ERROR CATEGORIZATION AND RETRY LOGIC
// =============================================================================

/**
 * Determine if an error is retryable based on its type and message
 * Consolidates retry logic from http-client.ts, github-api.ts, s3-utils.ts, etc.
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

  // Timeout errors
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

  // 5xx server errors are retryable
  if (/\b5\d{2}\b/.test(message)) return true;

  // Some 4xx errors are retryable
  if (message.includes("429")) return true; // Too Many Requests
  if (message.includes("408")) return true; // Request Timeout

  // 202 Accepted can indicate async processing in progress (commonly used by GitHub and other APIs)
  if (message.includes("202")) return true;

  return false;
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

  // Permanent failures
  if (message.includes("nosuchkey") || message.includes("access denied") || message.includes("invalid")) {
    return false;
  }

  return false;
}

/**
 * Check if GitHub API error is retryable
 */
function isRetryableGitHubError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();

  // GitHub specific retryable errors
  if (
    message.includes("403") || // Rate limiting
    message.includes("429") || // Too many requests
    message.includes("202") || // Data generation in progress
    message.includes("abuse detection")
  ) {
    return true;
  }

  return false;
}

// =============================================================================
// ERROR TRANSFORMATION AND UTILITIES
// =============================================================================

/**
 * Convert unknown error to a standardized Error instance
 */
export function normalizeError(error: unknown, context?: Record<string, unknown>): Error {
  if (error instanceof Error) {
    if (context) {
      (error as Error & { context?: Record<string, unknown> }).context = context;
    }
    return error;
  }

  if (typeof error === "string") {
    const err = new Error(error);
    if (context) {
      (err as Error & { context?: Record<string, unknown> }).context = context;
    }
    return err;
  }

  if (typeof error === "object" && error !== null) {
    const message = "message" in error ? String(error.message) : "Unknown error";
    const err = new Error(message);
    if (context) {
      (err as Error & { context?: Record<string, unknown> }).context = { ...context, originalError: error };
    }
    return err;
  }

  const err = new Error(String(error));
  if (context) {
    (err as Error & { context?: Record<string, unknown> }).context = context;
  }
  return err;
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

  const categorizedError = normalizedError as CategorizedError;
  categorizedError.category = category;
  categorizedError.severity = severity;
  categorizedError.isRetryable = isRetryable;
  categorizedError.context = context;
  categorizedError.originalError = error;

  // Extract status code if available
  if (typeof error === "object" && error !== null && "$metadata" in error) {
    const metadata = (
      error as { $metadata?: { httpStatusCode?: number } }
    ).$metadata;
    if (metadata?.httpStatusCode) {
      categorizedError.statusCode = metadata.httpStatusCode;
    }
  }

  return categorizedError;
}
