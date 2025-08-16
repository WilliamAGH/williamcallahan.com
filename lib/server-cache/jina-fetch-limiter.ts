/**
 * Jina AI Fetch Limiter
 *
 * Provides a global rate-limiting mechanism for the Jina AI Reader service.
 * This acts as a governor to prevent excessive external fetches, even if
 * other caching and circuit breaker layers would otherwise permit it.
 *
 * NOTE: This uses ServerCache for mutable rate limiting state. Next.js cache
 * is not suitable for rate limiting as it's designed for immutable data.
 * Consider using external rate limiting service (Redis, Upstash) in production.
 *
 * @module server-cache/jina-fetch-limiter
 */

import { debug, debugWarn } from "@/lib/utils/debug";
import { JINA_FETCH_CONFIG } from "@/lib/constants";
import type { JinaLimiterState } from "@/types/jina";
import { ServerCacheInstance } from "@/lib/server-cache";
import { isJinaLimiterState } from "@/types/jina";

const JINA_LIMITER_CACHE_KEY = "jina-fetch-limiter-state";

/**
 * Checks if a fetch is permitted by the Jina AI fetch limiter.
 * If permitted, it increments the count.
 *
 * @returns boolean - True if the fetch is allowed, false otherwise.
 */
export function isJinaFetchAllowed(): boolean {
  try {
    const state = ServerCacheInstance.get<JinaLimiterState>(JINA_LIMITER_CACHE_KEY);
    const now = Date.now();

    // Reset if the window has expired or state is invalid
    if (!isJinaLimiterState(state) || now - state.windowStartTimestamp > JINA_FETCH_CONFIG.windowMs) {
      debug("[JinaLimiter] Resetting Jina fetch limit window.");
      const newState: JinaLimiterState = {
        count: 1,
        windowStartTimestamp: now,
      };
      ServerCacheInstance.set(JINA_LIMITER_CACHE_KEY, newState);
      debug(`[JinaLimiter] Jina AI fetch permitted. Count is now ${newState.count}/${JINA_FETCH_CONFIG.maxRequests}.`);
      return true;
    }

    if (state.count >= JINA_FETCH_CONFIG.maxRequests) {
      debugWarn(
        `[JinaLimiter] Jina AI fetch limit exceeded (${state.count}/${JINA_FETCH_CONFIG.maxRequests}). Fetch blocked.`,
      );
      return false;
    }

    // Increment count and update cache
    const newState: JinaLimiterState = {
      ...state,
      count: state.count + 1,
    };
    ServerCacheInstance.set(JINA_LIMITER_CACHE_KEY, newState);
    debug(`[JinaLimiter] Jina AI fetch permitted. Count is now ${newState.count}/${JINA_FETCH_CONFIG.maxRequests}.`);

    return true;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    debugWarn(`[JinaLimiter] Error in isJinaFetchAllowed: ${error.message}`);
    // Default to allowing the fetch in case of an unexpected error to avoid blocking functionality.
    return true;
  }
}
