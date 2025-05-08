/**
 * Custom error classes for better error handling and debugging
 */

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
    super(message, 'MDX_PROCESSING_ERROR', cause);
    this.filePath = filePath;
  }
}

/**
 * Error for issues with reading files
 */
export class FileAccessError extends AppError {
  filePath: string;

  constructor(message: string, filePath: string, cause?: unknown) {
    super(message, 'FILE_ACCESS_ERROR', cause);
    this.filePath = filePath;
  }
}

/**
 * Error for issues with parsing frontmatter
 */
export class FrontmatterError extends AppError {
  filePath: string;

  constructor(message: string, filePath: string, cause?: unknown) {
    super(message, 'FRONTMATTER_ERROR', cause);
    this.filePath = filePath;
  }
}

/**
 * Error for missing or invalid blog post data
 */
export class BlogPostDataError extends AppError {
  slug?: string;

  constructor(message: string, slug?: string, cause?: unknown) {
    super(message, 'BLOG_POST_DATA_ERROR', cause);
    this.slug = slug;
  }
}

/**
 * Safely converts an unknown value to a string, avoiding "[object Object]".
 * @param value - The value to stringify.
 * @returns A string representation of the value.
 */
function safeStringifyValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "undefined") return "undefined";
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint' ||
    typeof value === 'symbol'
  ) {
    return String(value);
  }
  if (typeof value === 'function') {
    const funcStr = String(value);
    // Truncate long function strings
    return `Function: ${funcStr.substring(0, Math.min(funcStr.length, 100))}${funcStr.length > 100 ? '...' : ''}`;
  }

  // For objects, try to access a 'message' property first
  // This is a common pattern for error-like objects
  if (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof (value as { message: unknown }).message === 'string'
  ) {
    return (value as { message: string }).message;
  }

  // Then, attempt JSON.stringify
  try {
    return JSON.stringify(value);
  } catch {
    // Fallback for objects that cannot be stringified (e.g., circular references)
    let constructorName = 'unknown type';
    if (typeof value === 'object' && value !== null && value.constructor && value.constructor.name) {
      constructorName = value.constructor.name;
    }
    return `[Unstringifiable ${constructorName} value]`;
  }
}

/**
 * Utility function to wrap errors with more context
 * NOTE: This function assumes the provided ErrorClass constructor
 * can be called with (message: string, code: string, cause?: unknown).
 * It might not be safe for subclasses with different required constructor arguments.
 */
export function wrapError<T extends Error>(
  message: string,
  error: unknown,
  factory: (msg: string, cause?: unknown) => T,
): T {
  // Determine the cause: if the original error is an Error instance, use it.
  // Otherwise, wrap non-Error values by stringifying them so they’re not lost.
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
  if (
    error instanceof AppError &&
    newError instanceof AppError &&
    error.code &&
    !newError.code
  ) {
    (newError as AppError).code = error.code;
  }

  return newError;
}

/**
 * Check if an error is of a specific custom error type
 */
export function isErrorOfType<T extends Error>(
  error: unknown,
  errorType: new (...args: unknown[]) => T
): error is T {
  return error instanceof errorType;
}
