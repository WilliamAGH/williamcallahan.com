/**
 * @module lib/server-cache/github
 * @description Domain-specific cache methods for GitHub activity.
 * These methods are intended to be attached to the ServerCache prototype.
 */

import type { GitHubActivityCacheEntry, Cache } from "@/types/cache";
import type { GitHubActivityApiResponse } from "@/types/github";
import { GITHUB_ACTIVITY_CACHE_DURATION } from "@/lib/constants";
import { getMonotonicTime } from "@/lib/utils";

const isProductionBuildPhase = (): boolean => process.env.NEXT_PHASE === "phase-production-build";
const getCacheTimestamp = (): number => (isProductionBuildPhase() ? 0 : getMonotonicTime());

const GITHUB_ACTIVITY_CACHE_KEY = "github-activity-data";

export function getGithubActivity(cache: Cache): GitHubActivityCacheEntry | undefined {
  const key = GITHUB_ACTIVITY_CACHE_KEY;
  return cache.get<GitHubActivityCacheEntry>(key);
}

export function setGithubActivity(
  cache: Cache,
  activityData: GitHubActivityApiResponse,
  isFailure = false,
): void {
  const key = GITHUB_ACTIVITY_CACHE_KEY;
  const isDataComplete = activityData?.trailingYearData?.dataComplete === true;

  const payload: GitHubActivityCacheEntry = {
    data: activityData,
    lastFetchedAt: isFailure
      ? (getGithubActivity(cache)?.lastFetchedAt ?? getCacheTimestamp())
      : getCacheTimestamp(),
    lastAttemptedAt: getCacheTimestamp(),
  };

  const ttl =
    isFailure || !isDataComplete
      ? GITHUB_ACTIVITY_CACHE_DURATION.FAILURE
      : GITHUB_ACTIVITY_CACHE_DURATION.SUCCESS;

  const success = cache.set(key, payload, ttl);

  if (!success) {
    console.warn(`[ServerCache] Failed to set cache for key: ${key}. TTL was: ${ttl} seconds.`);
  }
}

export function clearGithubActivity(cache: Cache): void {
  cache.del(GITHUB_ACTIVITY_CACHE_KEY);
}

export function shouldRefreshGithubActivity(cache: Cache): boolean {
  const cached = getGithubActivity(cache);
  if (!cached?.lastFetchedAt) {
    return true;
  }

  const now = getCacheTimestamp();
  const timeSinceLastFetch = now - cached.lastFetchedAt;
  const revalidationThreshold = GITHUB_ACTIVITY_CACHE_DURATION.REVALIDATION * 1000;

  return timeSinceLastFetch > revalidationThreshold;
}
