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
  // Determine the cause: if the original error is an Error instance, use it, otherwise undefined.
  const cause = error instanceof Error ? error : undefined;

  // Create the new error using the provided factory function.
  const newError = factory(message, cause);

  // If the original error was an AppError with a code, and the newError is also an AppError,
  // try to preserve the original code if the newError doesn't have one set by the factory.
  // This is a bit more specific to AppError, so consider if this level of detail is needed
  // or if the factory should be solely responsible for all properties.
  if (
    error instanceof AppError &&
    newError instanceof AppError &&
    error.code &&
    !newError.code
  ) {
    // This part is tricky because AppError's code is readonly after construction.
    // A more robust factory might handle this, or AppError might need a way to set code post-construction if desired.
    // For now, we assume the factory handles setting the code appropriately if it needs to differ from a default.
    // If the factory always creates a generic AppError, it might lose the original specific code.
    // A potential improvement to AppError or the factory pattern might be needed for full code propagation control.
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
