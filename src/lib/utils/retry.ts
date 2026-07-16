/**
 * @file Unified Retry utility for handling operations with retry logic.
 * This module provides a reusable function to retry asynchronous operations with
 * configurable retries and exponential backoff. Consolidates retry logic from
 * multiple sources across the codebase.
 * @module lib/utils/retry
 */

import type { Result, RetryConfig } from "@/types/lib";
import { isRetryableError, normalizeError } from "./error-utils";
import { debug, debugWarn, debugError } from "./debug";

// Local wrapper to provide leveled debug logging consistent within this module
function debugLog(
  message: string,
  level: "info" | "warn" | "error" = "info",
  meta?: unknown,
): void {
  switch (level) {
    case "warn":
      debugWarn(message, meta);
      break;
    case "error":
      debugError(message, meta);
      break;
    default:
      debug(message, meta);
  }
}

// =============================================================================
// DOMAIN-SPECIFIC RETRY CONFIGURATIONS
// =============================================================================

/**
 * Consolidated retry configurations for different domains
 */
export const RETRY_CONFIGS = {
  // GitHub API specific configuration
  GITHUB_API: {
    maxRetries: 5,
    baseDelay: 1000,
    maxBackoff: 30000,
    jitter: true,
    isRetryable: (error: unknown) => isRetryableError(error, "github"),
    onRetry: (error: unknown, attempt: number) => {
      const errorMessage = normalizeError(error).message;
      const isRateLimit = errorMessage.includes("403") || errorMessage.includes("429");
      const is202 = errorMessage.includes("202");

      if (isRateLimit) {
        debugLog(`GitHub API rate limit hit`, "warn", { attempt });
      } else if (is202) {
        debugLog(`GitHub API data generation in progress`, "info", { attempt });
      } else {
        debugLog(`GitHub API retry attempt ${attempt}`, "warn", { error: errorMessage });
      }
    },
  } satisfies RetryConfig,

  // S3 operations configuration
  S3_OPERATIONS: {
    maxRetries: 3,
    baseDelay: 100,
    maxBackoff: 10000,
    jitter: true,
    isRetryable: (error: unknown) => isRetryableError(error, "s3"),
    onRetry: (error: unknown, attempt: number) => {
      debugLog(`S3 operation retry attempt ${attempt}`, "warn", {
        error: normalizeError(error).message,
      });
    },
  } satisfies RetryConfig,

  // OpenGraph fetch configuration
  OPENGRAPH_FETCH: {
    maxRetries: 3,
    baseDelay: 1000,
    maxBackoff: 10000,
    jitter: true,
    isRetryable: (error: unknown) => isRetryableError(error),
    onRetry: (error: unknown, attempt: number) => {
      debugLog(`OpenGraph fetch retry attempt ${attempt}`, "warn", {
        error: normalizeError(error).message,
      });
    },
  } satisfies RetryConfig,

  // HTTP client configuration
  HTTP_CLIENT: {
    maxRetries: 3,
    baseDelay: 1000,
    maxBackoff: 30000,
    jitter: true,
    isRetryable: (error: unknown) => isRetryableError(error),
    onRetry: (error: unknown, attempt: number) => {
      debugLog(`HTTP client retry attempt ${attempt}`, "warn", {
        error: normalizeError(error).message,
      });
    },
  } satisfies RetryConfig,

  // Image processing configuration
  IMAGE_PROCESSING: {
    maxRetries: 2,
    baseDelay: 2000,
    maxBackoff: 30000,
    jitter: true,
    isRetryable: (error: unknown) => isRetryableError(error),
    onRetry: (error: unknown, attempt: number) => {
      debugLog(`Image processing retry attempt ${attempt}`, "warn", {
        error: normalizeError(error).message,
      });
    },
  } satisfies RetryConfig,

  // Default configuration
  DEFAULT: {
    maxRetries: 3,
    baseDelay: 1000,
    maxBackoff: 30000,
    jitter: false,
    isRetryable: (error: unknown) => isRetryableError(error),
    onRetry: (error: unknown, attempt: number) => {
      debugLog(`Retry attempt ${attempt}`, "warn", { error: normalizeError(error).message });
    },
  } satisfies RetryConfig,
} as const;

// =============================================================================
// RETRY FUNCTIONS
// =============================================================================

/**
 * Retries an asynchronous operation with configurable options.
 * @template T - The return type of the operation.
 * @param operation - The asynchronous operation to retry, as a function that returns a Promise.
 * @param options - Configuration options for retry behavior.
 * @returns A discriminated result containing either the value or the terminal error.
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
  options: RetryConfig & {
    /** Lets a caller derive a bounded delay from an upstream response. */
    resolveDelay?: (error: Error, attempt: number, fallbackDelayMs: number) => number;
  } = {},
): Promise<Result<T>> {
  const {
    maxRetries = 3,
    maxBackoff = 30000,
    baseDelay = 1000,
    jitter = false,
    isRetryable = () => true,
    onRetry = () => {},
    debug = false,
    resolveDelay,
  } = options;

  let retries = 0;

  while (true) {
    try {
      const result = await operation();
      if (debug && retries > 0) {
        debugLog(`[Retry] Operation succeeded after ${retries} retries`);
      }
      return { success: true, data: result };
    } catch (error) {
      const currentError = normalizeError(error);

      if (!isRetryable(error)) {
        if (debug) {
          debugLog("[Retry] Non-retryable error encountered", "error", {
            error: currentError.message,
          });
        }
        return { success: false, error: currentError };
      }

      if (debug) {
        debugLog(`[Retry] Operation failed (attempt ${retries + 1}/${maxRetries + 1})`, "warn", {
          error: currentError.message,
        });
      }

      if (retries >= maxRetries) {
        if (debug) {
          debugLog(`[Retry] All ${maxRetries + 1} attempts failed. Giving up.`, "error", {
            lastError: currentError.message,
          });
        }
        return { success: false, error: currentError };
      }

      retries++;
      onRetry(currentError, retries);

      const fallbackDelayMs = computeExponentialDelay(
        retries,
        baseDelay,
        maxBackoff,
        jitter ? 0.2 : 0,
      );
      const requestedDelayMs = resolveDelay
        ? resolveDelay(currentError, retries, fallbackDelayMs)
        : fallbackDelayMs;

      if (!Number.isFinite(requestedDelayMs) || requestedDelayMs < 0) {
        return {
          success: false,
          error: new TypeError("Retry delay must be a finite non-negative number of milliseconds."),
        };
      }

      const backoff = Math.min(requestedDelayMs, maxBackoff);

      if (debug) {
        debugLog(`[Retry] Retrying operation after ${backoff}ms delay...`, "info");
      }

      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
}

/**
 * Quick retry using domain-specific configuration
 */
export async function retryWithDomainConfig<T>(
  operation: () => Promise<T>,
  domain: keyof typeof RETRY_CONFIGS,
): Promise<Result<T>> {
  return retryWithOptions(operation, RETRY_CONFIGS[domain]);
}

/**
 * Enhanced retry function that throws on final failure instead of returning null
 */
export async function retryWithThrow<T>(
  operation: () => Promise<T>,
  options: Parameters<typeof retryWithOptions>[1] = {},
): Promise<T> {
  const result = await retryWithOptions(operation, options);
  if (!result.success) {
    throw result.error;
  }
  return result.data;
}

/**
 * Simple delay utility for rate limiting and API courtesy delays
 * @param ms - Delay in milliseconds
 * @returns Promise that resolves after the specified delay
 */
export async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Compute exponential back-off delay with optional jitter.
 * Extracted so callers can reuse the exact logic without duplicating it.
 *
 * @param attempt       1-based retry attempt (1 = first retry)
 * @param baseDelay     Initial delay in ms (e.g. 1000)
 * @param maxDelay      Maximum back-off cap in ms
 * @param jitterFactor  0–1 range amount of random jitter to add (0.3 = ±30%)
 */
export function computeExponentialDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number,
  jitterFactor = 0,
): number {
  // Exponential growth – attempt 1 => baseDelay, attempt 2 => 2x, etc.
  let delay = Math.min(baseDelay * 2 ** (attempt - 1), maxDelay);

  if (jitterFactor > 0) {
    // Jitter between -jitterFactor and +jitterFactor of the delay
    const jitter = (Math.random() * 2 - 1) * jitterFactor;
    delay = Math.round(delay * (1 + jitter));
  }

  return delay;
}
