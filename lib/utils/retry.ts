/**
 * @file Retry utility for handling operations with retry logic.
 * This module provides a reusable function to retry asynchronous operations with
 * configurable retries and exponential backoff.
 * @module lib/utils/retry
 */

/**
 * Configuration options for retry behavior
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Maximum backoff time in milliseconds (default: 30000) */
  maxBackoff?: number;
  /** Base delay in milliseconds for exponential backoff (default: 1000) */
  baseDelay?: number;
  /** Whether to add jitter to prevent thundering herd (default: false) */
  jitter?: boolean;
  /** Log prefix for console messages (default: "[Retry]") */
  logPrefix?: string;
  /** Whether to log debug messages (default: false) */
  debug?: boolean;
  /** Custom function to determine if an error is retryable */
  isRetryable?: (error: unknown) => boolean;
  /** Callback for each retry attempt */
  onRetry?: (error: unknown, attempt: number) => void;
}

/**
 * Retries an asynchronous operation with exponential backoff.
 * @template T - The return type of the operation.
 * @param operation - The asynchronous operation to retry, as a function that returns a Promise.
 * @param maxRetries - The maximum number of retries before giving up (default: 3).
 * @param maxBackoff - The maximum backoff time in milliseconds (default: 30000).
 * @returns Promise resolving to the operation's result if successful, or null if all retries fail.
 * @deprecated Use retryWithOptions instead for more flexibility
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  maxBackoff = 30000,
): Promise<T | null> {
  return retryWithOptions(operation, {
    maxRetries,
    maxBackoff,
    debug: true, // Maintain backward compatibility with existing debug logs
  });
}

/**
 * Retries an asynchronous operation with configurable options.
 * @template T - The return type of the operation.
 * @param operation - The asynchronous operation to retry, as a function that returns a Promise.
 * @param options - Configuration options for retry behavior.
 * @returns Promise resolving to the operation's result if successful, or null if all retries fail.
 * @example
 * ```typescript
 * const result = await retryWithOptions(
 *   async () => await fetchData(),
 *   {
 *     maxRetries: 5,
 *     jitter: true,
 *     onRetry: (error, attempt) => console.log(`Attempt ${attempt} failed:`, error),
 *     isRetryable: (error) => error instanceof NetworkError
 *   }
 * );
 * ```
 */
export async function retryWithOptions<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T | null> {
  const {
    maxRetries = 3,
    maxBackoff = 30000,
    baseDelay = 1000,
    jitter = false,
    logPrefix = "[Retry]",
    debug = false,
    isRetryable = () => true,
    onRetry = () => {},
  } = options;

  let retries = 0;
  while (retries < maxRetries) {
    try {
      const result = await operation();
      if (result) {
        return result;
      }
      retries++;
      if (retries === maxRetries) {
        console.warn(`${logPrefix} Operation failed after ${maxRetries} attempts.`);
        return null;
      }
    } catch (error) {
      if (!isRetryable(error)) {
        console.error(`${logPrefix} Non-retryable error encountered:`, error instanceof Error ? error.message : String(error));
        return null;
      }
      
      retries++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`${logPrefix} Operation failed (attempt ${retries}/${maxRetries}):`, errorMessage);
      
      if (retries === maxRetries) {
        console.warn(`${logPrefix} All ${maxRetries} attempts failed. Giving up.`);
        return null;
      }
      
      // Call retry callback
      onRetry(error, retries);
    }
    
    // Calculate exponential backoff with optional jitter
    let backoff = Math.min(baseDelay * Math.pow(2, retries - 1), maxBackoff);
    
    if (jitter) {
      // Add random jitter between -20% and +20% of the delay
      const jitterFactor = 0.8 + Math.random() * 0.4;
      backoff = Math.round(backoff * jitterFactor);
    }
    
    if (debug) {
      console.debug(`${logPrefix} Retrying operation after ${backoff}ms delay...`);
    }
    
    await new Promise((resolve) => setTimeout(resolve, backoff));
  }
  return null; // This line should never be reached due to the check above
}
