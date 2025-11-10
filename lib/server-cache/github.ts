/**
 * @module lib/server-cache/github
 * @description Domain-specific cache methods for GitHub activity.
 * These methods are intended to be attached to the ServerCache prototype.
 */

import type { GitHubActivityCacheEntry, ICache } from "@/types/cache";
import type { GitHubActivityApiResponse } from "@/types/github";
import { GITHUB_ACTIVITY_CACHE_DURATION } from "@/lib/constants";

const getCacheTimestamp = (): number => (process.env.NEXT_PHASE === "phase-production-build" ? 0 : Date.now());

const GITHUB_ACTIVITY_CACHE_KEY = "github-activity-data";

export function getGithubActivity(this: ICache): GitHubActivityCacheEntry | undefined {
  const key = GITHUB_ACTIVITY_CACHE_KEY;
  return this.get<GitHubActivityCacheEntry>(key);
}

export function setGithubActivity(this: ICache, activityData: GitHubActivityApiResponse, isFailure = false): void {
  const key = GITHUB_ACTIVITY_CACHE_KEY;
  const isDataComplete = activityData?.trailingYearData?.dataComplete === true;

  const payload: GitHubActivityCacheEntry = {
    data: activityData,
    lastFetchedAt: isFailure
      ? (getGithubActivity.call(this)?.lastFetchedAt ?? getCacheTimestamp())
      : getCacheTimestamp(),
    lastAttemptedAt: getCacheTimestamp(),
  };

  const ttl =
    isFailure || !isDataComplete ? GITHUB_ACTIVITY_CACHE_DURATION.FAILURE : GITHUB_ACTIVITY_CACHE_DURATION.SUCCESS;

  const success = this.set(key, payload, ttl);

  if (!success) {
    console.warn(`[ServerCache] Failed to set cache for key: ${key}. TTL was: ${ttl} seconds.`);
  }
}

export function clearGithubActivity(this: ICache): void {
  this.del(GITHUB_ACTIVITY_CACHE_KEY);
}

export function shouldRefreshGithubActivity(this: ICache): boolean {
  const cached = getGithubActivity.call(this);
  if (!cached?.lastFetchedAt) {
    return true;
  }

  const now = getCacheTimestamp();
  const timeSinceLastFetch = now - cached.lastFetchedAt;
  const revalidationThreshold = GITHUB_ACTIVITY_CACHE_DURATION.REVALIDATION * 1000;

  return timeSinceLastFetch > revalidationThreshold;
}
