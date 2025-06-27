/**
 * @file Manages rate limiting for various operations within the application.
 * Provides mechanisms to check if an operation is allowed and to wait for a permit.
 * Supports multiple rate limiting contexts with configurable limits.
 *
 * @module lib/rate-limiter
 */

import type { RateLimiterConfig, RateLimitRecord } from "@/types/lib";
import { readJsonS3, writeJsonS3 } from "@/lib/s3-utils";

/**
 * In-memory store for rate limit records.
 * Keys are context-specific identifiers (e.g., IP address for API limiting,
 * or a fixed string like 'opengraph_fetches' for global outgoing request limiting).
 * The outer key is a 'namespace' or 'storeName' to keep different limiters separate.
 */
const rateLimitStores: Record<string, Record<string, RateLimitRecord>> = {};

/**
 * Checks if an operation is allowed for a given context and configuration,
 * and updates the count if allowed.
 * This is a synchronous check and does not wait.
 *
 * @param storeName - A namespace for the rate limit store (e.g., 'apiEndpoints', 'outgoingRequests').
 * @param contextId - A unique identifier for the entity being rate-limited within the store (e.g., IP address, 'global').
 * @param config - The rate limit configuration (maxRequests, windowMs).
 * @returns True if the operation is allowed, false otherwise.
 */
export function isOperationAllowed(storeName: string, contextId: string, config: RateLimiterConfig): boolean {
  // ---------------------------------------------------------------------------
  // Validate configuration – throw early for clearly invalid settings so that
  // callers (and tests) can rely on deterministic behaviour.
  // ---------------------------------------------------------------------------
  if (config.maxRequests <= 0) {
    throw new Error(`Invalid maxRequests: ${config.maxRequests}. Must be greater than 0.`);
  }
  if (config.windowMs <= 0) {
    throw new Error(`Invalid windowMs: ${config.windowMs}. Must be greater than 0.`);
  }

  if (!rateLimitStores[storeName]) {
    rateLimitStores[storeName] = {};
  }
  const store = rateLimitStores[storeName];
  const now = Date.now();

  // Clean up expired entries to prevent unbounded memory growth
  for (const [key, record] of Object.entries(store)) {
    if (now > record.resetAt) {
      delete store[key];
    }
  }

  const record = store[contextId];

  if (!record || now > record.resetAt) {
    store[contextId] = {
      count: 1,
      resetAt: now + config.windowMs,
    };
    return true;
  }

  if (record.count < config.maxRequests) {
    record.count++;
    return true;
  }

  return false;
}

/**
 * Waits until an operation is permitted according to the rate limit configuration.
 * This function will poll until a slot is available, with intelligent wait times.
 *
 * @async
 * @param storeName - A namespace for the rate limit store.
 * @param contextId - A unique identifier for the entity being rate-limited.
 * @param config - The rate limit configuration.
 * @param pollIntervalMs - How often to check for permit availability (default: 50ms).
 *                         Adjust based on desired responsiveness and window size.
 * @param timeoutMs - Optional timeout in milliseconds. If provided, the function will reject
 *                    after this duration if no permit is available.
 * @returns A Promise that resolves when the operation is permitted.
 * @throws Error if timeout is exceeded.
 */
export async function waitForPermit(
  storeName: string,
  contextId: string,
  config: RateLimiterConfig,
  pollIntervalMs = 50,
  timeoutMs?: number,
): Promise<void> {
  const startTime = Date.now();

  // Ensure pollInterval is sensible, e.g., not too small compared to window
  // Also, ensure it's not excessively large if windowMs is very small.
  const effectivePollInterval = Math.max(
    10, // Minimum poll interval
    Math.min(pollIntervalMs, config.windowMs / 2, 200), // Sensible upper bound relative to window, capped at 200ms
  );

  while (true) {
    // Check timeout
    if (timeoutMs !== undefined && Date.now() - startTime > timeoutMs) {
      throw new Error(`Rate limit wait timeout exceeded after ${timeoutMs}ms`);
    }

    if (isOperationAllowed(storeName, contextId, config)) {
      return; // Permit acquired
    }

    // Calculate wait time - prefer sleeping until reset for long windows
    const store = rateLimitStores[storeName];
    const record = store?.[contextId];
    let waitTime = effectivePollInterval;

    if (record && record.resetAt > Date.now() && record.count >= config.maxRequests) {
      const timeToReset = record.resetAt - Date.now();

      // For long waits (>1 second), sleep until reset with small buffer instead of polling
      if (timeToReset > 1000) {
        waitTime = timeToReset + 50; // Wait until reset + 50ms buffer
      } else {
        // For short waits, use standard poll interval or time to reset, whichever is shorter
        waitTime = Math.min(timeToReset + 10, effectivePollInterval);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, Math.max(10, waitTime))); // Ensure waitTime is not too small or negative
  }
}

/**
 * Loads a rate limit store from S3 and hydrates the in-memory map.
 * Missing files are treated as an empty store.
 */
export async function loadRateLimitStoreFromS3(storeName: string, s3Path: string): Promise<void> {
  try {
    const remoteData = (await readJsonS3<Record<string, RateLimitRecord>>(s3Path)) ?? {};
    rateLimitStores[storeName] = remoteData;
  } catch (error: unknown) {
    // If file does not exist or parse error, start with empty store but log once
    console.warn(`RateLimiter: unable to load store ${storeName} from ${s3Path}:`, error);
    rateLimitStores[storeName] = {};
  }
}

/**
 * Persists a specific rate limit store to S3.
 */
export async function persistRateLimitStoreToS3(storeName: string, s3Path: string): Promise<void> {
  try {
    const store = rateLimitStores[storeName] ?? {};
    await writeJsonS3(s3Path, store);
  } catch (error: unknown) {
    console.error(`RateLimiter: failed to persist store ${storeName} to ${s3Path}:`, error);
  }
}

/**
 * Convenience helper: updates in-memory counter (via isOperationAllowed) **and** persists.
 */
export function incrementAndPersist(
  storeName: string,
  contextId: string,
  config: RateLimiterConfig,
  s3Path: string,
): boolean {
  const allowed = isOperationAllowed(storeName, contextId, config);
  if (allowed) {
    // Fire-and-forget persist; do not block critical path.
    void persistRateLimitStoreToS3(storeName, s3Path);
  }
  return allowed;
}
