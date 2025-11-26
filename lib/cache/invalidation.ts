/**
 * Centralized Cache Invalidation Utilities
 *
 * Single source of truth for invalidating GitHub activity caches.
 * This module consolidates cache invalidation logic that was previously
 * scattered across multiple files.
 *
 * Used by:
 * - app/api/revalidate/github-activity/route.ts (scheduler callback)
 * - app/api/github-activity/refresh/route.ts (manual refresh)
 * - app/api/cache/clear/route.ts (admin cache clear)
 * - lib/data-access/github-public-api.ts (data access layer)
 * - lib/server/data-fetch-manager.ts (orchestrator)
 *
 * @module cache/invalidation
 */

import { ServerCacheInstance } from "@/lib/server-cache";
import { cacheContextGuards, USE_NEXTJS_CACHE } from "@/lib/cache";
import { envLogger } from "@/lib/utils/env-logger";

/**
 * Cache tags used for GitHub activity in Next.js cache
 * These tags are used with the `cacheTag` directive in "use cache" functions
 */
export const GITHUB_CACHE_TAGS = {
  /** Primary tag for all GitHub activity data */
  PRIMARY: "github-activity",
  /** Category tag for GitHub-related caches */
  CATEGORY: "GitHubActivity",
  /** Main data cache tag */
  MAIN: "github-activity-main",
} as const;

/**
 * In-memory cache keys for GitHub activity data
 * These keys are used with ServerCacheInstance
 */
export const GITHUB_CACHE_KEYS = {
  /** Main activity data */
  ACTIVITY: "github-activity",
  /** Summary statistics */
  SUMMARY: "github-activity-summary",
  /** Weekly aggregated data */
  WEEKLY: "github-activity-weekly",
} as const;

/**
 * Invalidate all GitHub activity caches (in-memory + Next.js)
 *
 * This function should be called after any GitHub data update to ensure
 * fresh data is served to users. It clears both:
 * 1. In-memory ServerCache entries (immediate effect)
 * 2. Next.js cache tags (triggers revalidation on next request)
 *
 * @example
 * ```ts
 * // After successful GitHub data refresh
 * await refreshGitHubActivityDataFromApi();
 * invalidateAllGitHubCaches();
 * ```
 */
export function invalidateAllGitHubCaches(): void {
  const category = "GitHubCacheInvalidation";

  try {
    // 1. Clear in-memory cache entries
    ServerCacheInstance.del(GITHUB_CACHE_KEYS.ACTIVITY);
    ServerCacheInstance.del(GITHUB_CACHE_KEYS.SUMMARY);
    ServerCacheInstance.del(GITHUB_CACHE_KEYS.WEEKLY);
    envLogger.log("Cleared in-memory GitHub caches", undefined, { category });

    // 2. Invalidate Next.js cache tags (if available)
    if (USE_NEXTJS_CACHE) {
      cacheContextGuards.revalidateTag(
        category,
        GITHUB_CACHE_TAGS.PRIMARY,
        GITHUB_CACHE_TAGS.CATEGORY,
        GITHUB_CACHE_TAGS.MAIN,
      );
      envLogger.log("Invalidated Next.js cache tags", undefined, { category });
    }
  } catch (error) {
    // Non-fatal - log and continue
    // Cache invalidation failures shouldn't break the application
    envLogger.log(
      "Cache invalidation error (non-fatal)",
      { error: error instanceof Error ? error.message : String(error) },
      { category },
    );
  }
}
