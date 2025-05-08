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
export function wrapError<T extends AppError>(
  message: string,
  error: unknown,
  ErrorClass: new (message: string, code: string, cause?: unknown) => T
): T {
  if (error instanceof Error) {
    return new ErrorClass(message, 'ERROR', error);
  }
  return new ErrorClass(message + ': ' + String(error), 'ERROR');
}

/**
 * Check if an error is of a specific custom error type
 */
export function isErrorOfType<T extends Error>(
  error: unknown,
  errorType: new (...args: unknown[]) => T
): error is T {
  return error instanceof Error && error.name === errorType.name;
}
