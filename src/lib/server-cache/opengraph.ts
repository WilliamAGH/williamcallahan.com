/**
 * @module lib/server-cache/opengraph
 * @description Domain-specific cache methods for OpenGraph data.
 * These methods are intended to be attached to the ServerCache prototype.
 */

import type { ICache } from "@/types/cache";
import type { OgResult, OgCacheEntry } from "@/types/opengraph";
import { ogResultSchema } from "@/types/seo/opengraph";
import { OPENGRAPH_CACHE_DURATION, TIME_CONSTANTS } from "@/lib/constants";
import { envLogger } from "@/lib/utils/env-logger";
import { getMonotonicTime } from "@/lib/utils";

const OPENGRAPH_PREFIX = "og-data:";
const REFRESH_TRACKING_PREFIX = "og-refresh-attempt:";
const REFRESH_COOLDOWN_MS = TIME_CONSTANTS.FIVE_MINUTES_MS; // 5 minutes between refresh attempts
const isProductionBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
const getCacheTimestamp = (): number => (isProductionBuildPhase ? 0 : getMonotonicTime());

export function getOpenGraphData(this: ICache, url: string): OgCacheEntry | undefined {
  const key = OPENGRAPH_PREFIX + url;
  return this.get<OgCacheEntry>(key);
}

export function setOpenGraphData(this: ICache, url: string, data: OgResult, isFailure = false): void {
  const key = OPENGRAPH_PREFIX + url;
  const now = getCacheTimestamp();
  const existing = getOpenGraphData.call(this, url);

  const validationResult = ogResultSchema.safeParse(data);
  const validatedData: OgResult = validationResult.success
    ? { ...validationResult.data, url: data.url }
    : { ...data, timestamp: data.timestamp || now };

  if (!validationResult.success) {
    envLogger.log(
      `OpenGraph data failed strict validation for ${url} – caching anyway`,
      { url },
      { category: "ServerCache" },
    );
  }

  const cacheEntry: OgCacheEntry = {
    data: validatedData,
    lastAttemptedAt: now,
    lastFetchedAt: isFailure ? (existing?.lastFetchedAt ?? 0) : now,
    isFailure,
  };

  this.set(key, cacheEntry, isFailure ? OPENGRAPH_CACHE_DURATION.FAILURE : OPENGRAPH_CACHE_DURATION.SUCCESS);
}

export function shouldRefreshOpenGraph(this: ICache, url: string): boolean {
  const cached = getOpenGraphData.call(this, url);
  if (!cached) {
    return true;
  }

  if (cached.isFailure) {
    const timeSinceLastAttempt = getCacheTimestamp() - cached.lastAttemptedAt;
    return timeSinceLastAttempt > OPENGRAPH_CACHE_DURATION.FAILURE * 1000;
  }

  const timeSinceLastFetch = getCacheTimestamp() - cached.lastFetchedAt;
  return timeSinceLastFetch > OPENGRAPH_CACHE_DURATION.SUCCESS * 1000;
}

export function clearOpenGraphData(this: ICache, url?: string): void {
  if (url) {
    const key = OPENGRAPH_PREFIX + url;
    this.del(key);
  } else {
    const keys = this.keys().filter(key => key.startsWith(OPENGRAPH_PREFIX));
    for (const key of keys) {
      this.del(key);
    }
  }
}

/**
 * Delete specific OpenGraph cache entry (for corruption recovery)
 */
export function deleteOpenGraphData(this: ICache, url: string): void {
  const key = OPENGRAPH_PREFIX + url;
  this.del(key);
  envLogger.log(`Deleted corrupted OpenGraph cache entry`, { url }, { category: "ServerCache" });
}

/**
 * Invalidate OpenGraph cache when image URLs become stale (e.g., 404s)
 * This automatically triggers a background refresh to get updated image URLs
 */
export function invalidateStaleOpenGraphData(this: ICache, pageUrl: string, reason: string): boolean {
  const refreshKey = REFRESH_TRACKING_PREFIX + pageUrl;
  const lastRefresh = this.get<number>(refreshKey);
  const now = getCacheTimestamp();

  // Check if we recently attempted a refresh (cooldown period)
  if (lastRefresh && now - lastRefresh < REFRESH_COOLDOWN_MS) {
    const remainingCooldown = Math.round((REFRESH_COOLDOWN_MS - (now - lastRefresh)) / 1000);
    envLogger.log(
      `Skipping OpenGraph refresh for ${pageUrl} - in cooldown period`,
      { pageUrl, remainingCooldownSeconds: remainingCooldown },
      { category: "ServerCache" },
    );
    return false;
  }

  // Invalidate the cached OpenGraph data
  try {
    deleteOpenGraphData.call(this, pageUrl);
  } catch (error) {
    envLogger.log(
      `Failed to delete OpenGraph data for ${pageUrl}`,
      { error: error instanceof Error ? error.message : String(error), pageUrl },
      { category: "ServerCache" },
    );
    return false;
  }

  // Track this refresh attempt
  this.set(refreshKey, now, REFRESH_COOLDOWN_MS / 1000);

  envLogger.log(
    `OpenGraph Auto-Recovery: Invalidated stale cache`,
    { pageUrl, reason, nextRefreshAllowedInSeconds: Math.round(REFRESH_COOLDOWN_MS / 1000) },
    { category: "OpenGraphAutoRecovery" },
  );
  return true;
}
