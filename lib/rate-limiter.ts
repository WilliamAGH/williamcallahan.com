/**
 * @file Manages rate limiting for various operations within the application.
 * Provides mechanisms to check if an operation is allowed and to wait for a permit.
 * Supports multiple rate limiting contexts with configurable limits.
 *
 * @module lib/rate-limiter
 */

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

export interface RateLimitConfig {
  /** Maximum number of requests allowed within the window. */
  maxRequests: number;
  /** Duration of the rate limit window in milliseconds. */
  windowMs: number;
}

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
export function isOperationAllowed(
  storeName: string,
  contextId: string,
  config: RateLimitConfig
): boolean {
  if (!rateLimitStores[storeName]) {
    rateLimitStores[storeName] = {};
  }
  const store = rateLimitStores[storeName];
  const now = Date.now();
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
 * This function will poll until a slot is available.
 *
 * @async
 * @param storeName - A namespace for the rate limit store.
 * @param contextId - A unique identifier for the entity being rate-limited.
 * @param config - The rate limit configuration.
 * @param pollIntervalMs - How often to check for permit availability (default: 50ms).
 *                         Adjust based on desired responsiveness and window size.
 * @returns A Promise that resolves when the operation is permitted.
 */
export async function waitForPermit(
  storeName: string,
  contextId: string,
  config: RateLimitConfig,
  pollIntervalMs = 50
): Promise<void> {
  // Ensure pollInterval is sensible, e.g., not too small compared to window
  // Also, ensure it's not excessively large if windowMs is very small.
  const effectivePollInterval = Math.max(
    10, // Minimum poll interval
    Math.min(pollIntervalMs, config.windowMs / 2, 200) // Sensible upper bound relative to window, capped at 200ms
  );

  while (true) {
    if (isOperationAllowed(storeName, contextId, config)) {
      return; // Permit acquired
    }

    // Calculate wait time
    const store = rateLimitStores[storeName];
    const record = store?.[contextId];
    let waitTime = effectivePollInterval;

    if (record && record.resetAt > Date.now() && record.count >= config.maxRequests) {
      // If limit is hit and we know the reset time, wait until then plus a small buffer,
      // or the standard poll interval, whichever is shorter for responsiveness.
      const timeToReset = record.resetAt - Date.now();
      waitTime = Math.min(timeToReset + 10, effectivePollInterval); // Wait until reset + 10ms buffer, or standard poll
    }
    
    await new Promise(resolve => setTimeout(resolve, Math.max(10, waitTime))); // Ensure waitTime is not too small or negative
  }
}

// --- Pre-configured limiters for common use cases (optional, or configure at usage site) ---

/**
 * Default configuration for API endpoint rate limiting (e.g., per IP).
 * Original values from app/api/bookmarks/refresh/route.ts were 5 requests per 60 seconds.
 */
export const DEFAULT_API_ENDPOINT_LIMIT_CONFIG: RateLimitConfig = {
  maxRequests: 5,
  windowMs: 60 * 1000, // 1 minute
};
export const API_ENDPOINT_STORE_NAME = 'apiEndpoints';


/**
 * Default configuration for outgoing OpenGraph fetch requests.
 * Aiming for approximately 10 requests per second.
 */
export const DEFAULT_OPENGRAPH_FETCH_LIMIT_CONFIG: RateLimitConfig = {
  maxRequests: 10,
  windowMs: 1000, // per 1 second
};
export const OPENGRAPH_FETCH_STORE_NAME = 'outgoingOpenGraph';
/** 
 * Context ID for a global limit on all OpenGraph fetches.
 * If per-domain limiting is desired later, this could be dynamic.
 */
export const OPENGRAPH_FETCH_CONTEXT_ID = 'global';
