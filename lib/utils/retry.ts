/**
 * @file Retry utility for handling operations with retry logic.
 * This module provides a reusable function to retry asynchronous operations with
 * configurable retries and exponential backoff.
 * @module lib/utils/retry
 */

import type { RetryConfig } from "@/types/lib";

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
export async function retryWithOptions<T>(operation: () => Promise<T>, options: RetryConfig = {}): Promise<T | null> {
  const {
    maxRetries = 3,
    maxBackoff = 30000,
    baseDelay = 1000,
    jitter = false,
    isRetryable = () => true,
    onRetry = () => {},
  } = options;

  let retries = 0;
  while (retries < maxRetries) {
    try {
      return await operation();
    } catch (error) {
      const currentError = error as Error;
      if (!isRetryable(currentError)) {
        console.error("[Retry] Non-retryable error encountered:", currentError.message);
        return null;
      }

      retries++;
      console.error(`[Retry] Operation failed (attempt ${retries}/${maxRetries}):`, currentError.message);

      if (retries === maxRetries) {
        console.warn(`[Retry] All ${maxRetries} attempts failed. Giving up.`);
        return null;
      }

      onRetry(currentError, retries);
    }

    // Calculate exponential backoff with optional jitter
    let backoff = Math.min(baseDelay * 2 ** (retries - 1), maxBackoff);

    if (jitter) {
      // Add random jitter between -20% and +20% of the delay
      const jitterFactor = 0.8 + Math.random() * 0.4;
      backoff = Math.round(backoff * jitterFactor);
    }

    console.debug(`[Retry] Retrying operation after ${backoff}ms delay...`);

    await new Promise((resolve) => setTimeout(resolve, backoff));
  }
  return null;
}
