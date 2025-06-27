/**
 * Cache utilities for mapping TTL values to Next.js cache profiles and
 * providing a safe fallback mechanism when cached calls fail
 *
 * Exports:
 * - CACHE_TTL, USE_NEXTJS_CACHE: Default cache configuration constants
 * - getCacheProfile(ttlSeconds): Map TTL seconds to 'minutes' | 'hours' | 'days' | 'weeks'
 * - withCacheFallback(cachedFn, fallbackFn): Execute cached function with fallback on error
 */
import type { CacheProfile } from "@/types/cache-profile";
import { CACHE_TTL, USE_NEXTJS_CACHE } from "@/lib/constants";

// Re-export for backward compatibility
export { CACHE_TTL, USE_NEXTJS_CACHE };

/**
 * Maps TTL seconds to Next.js cache profiles
 */
export function getCacheProfile(ttlSeconds: number): CacheProfile {
  if (ttlSeconds <= 60) return "minutes";
  if (ttlSeconds <= 3600) return "hours";
  if (ttlSeconds <= 86400) return "days";
  return "weeks";
}

/**
 * Error boundary for cache fallbacks
 */
export async function withCacheFallback<T>(cachedFn: () => Promise<T>, fallbackFn: () => Promise<T>): Promise<T> {
  try {
    return await cachedFn();
  } catch (error) {
    console.warn("Cache function failed, using fallback:", error);
    return await fallbackFn();
  }
}
