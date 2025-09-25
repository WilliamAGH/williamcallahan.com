/**
 * Cache utilities for mapping TTL values to Next.js cache profiles and
 * providing a safe fallback mechanism when cached calls fail
 *
 * Exports:
 * - CACHE_TTL, USE_NEXTJS_CACHE: Default cache configuration constants
 * - getCacheProfile(ttlSeconds): Map TTL seconds to 'minutes' | 'hours' | 'days' | 'weeks'
 * - withCacheFallback(cachedFn, fallbackFn): Execute cached function with fallback on error
 */
import type { CacheDurationProfile } from "@/types/cache-profile";
import { CACHE_TTL, USE_NEXTJS_CACHE } from "@/lib/constants";
import { envLogger } from "@/lib/utils/env-logger";
import {
  unstable_cacheLife as nextCacheLife,
  unstable_cacheTag as nextCacheTag,
  revalidateTag as nextRevalidateTag,
} from "next/cache";

// Re-export for backward compatibility
export { CACHE_TTL, USE_NEXTJS_CACHE };

export const isCliLikeCacheContext = (): boolean => {
  const argv1 = process.argv[1] || "";
  const inScriptsDir = /(^|[\\/])scripts[\\/]/.test(argv1);
  return (
    inScriptsDir ||
    process.argv.includes("data-updater") ||
    process.argv.includes("reset-and-regenerate") ||
    process.argv.includes("regenerate-content") ||
    process.env.NEXT_PHASE === "phase-production-build"
  );
};

const shouldLogCacheWarning = (): boolean =>
  process.env.NODE_ENV === "development" && !isCliLikeCacheContext() && !process.env.SUPPRESS_CACHE_WARNINGS;

const logCacheWarning = (
  category: string,
  action: "cacheLife" | "cacheTag" | "revalidateTag",
  error: unknown,
): void => {
  const message = error instanceof Error ? error.message : String(error);
  envLogger.debug("Cache API unavailable", { action, error: message }, { category: `Cache:${category}` });
};

const normalizeCategory = (category: string): string => (category || "Cache").trim() || "Cache";

const withGuard = <Args extends unknown[]>(
  action: "cacheLife" | "cacheTag" | "revalidateTag",
  fn: (category: string, ...args: Args) => void,
): ((category: string, ...args: Args) => void) => {
  return (category: string, ...args: Args) => {
    const safeCategory = normalizeCategory(category);
    try {
      fn(safeCategory, ...args);
    } catch (error) {
      if (shouldLogCacheWarning()) {
        logCacheWarning(safeCategory, action, error);
      }
    }
  };
};

export const cacheContextGuards = {
  cacheLife: withGuard("cacheLife", (category: string, profile: CacheDurationProfile) => {
    if (typeof nextCacheLife === "function" && !isCliLikeCacheContext()) {
      nextCacheLife(profile);
    }
  }),
  cacheTag: withGuard("cacheTag", (_category: string, ...tags: string[]) => {
    if (typeof nextCacheTag === "function" && !isCliLikeCacheContext()) {
      for (const tag of new Set(tags)) nextCacheTag(tag);
    }
  }),
  revalidateTag: withGuard("revalidateTag", (_category: string, ...tags: string[]) => {
    if (typeof nextRevalidateTag === "function" && !isCliLikeCacheContext()) {
      for (const tag of new Set(tags)) nextRevalidateTag(tag);
    }
  }),
};

/**
 * Maps TTL seconds to Next.js cache profiles
 */
export function getCacheProfile(ttlSeconds: number): CacheDurationProfile {
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
