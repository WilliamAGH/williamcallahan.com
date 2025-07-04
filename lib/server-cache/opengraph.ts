/**
 * @module lib/server-cache/opengraph
 * @description Domain-specific cache methods for OpenGraph data.
 * These methods are intended to be attached to the ServerCache prototype.
 */

import type { ICache } from "@/types/cache";
import type { OgResult, OgCacheEntry } from "@/types/opengraph";
import { ogResultSchema } from "@/types/seo/opengraph";
import { OPENGRAPH_CACHE_DURATION } from "@/lib/constants";
import { TIME_CONSTANTS } from "@/lib/constants";

const OPENGRAPH_PREFIX = "og-data:";
const REFRESH_TRACKING_PREFIX = "og-refresh-attempt:";
const REFRESH_COOLDOWN_MS = TIME_CONSTANTS.FIVE_MINUTES_MS; // 5 minutes between refresh attempts

export function getOpenGraphData(this: ICache, url: string): OgCacheEntry | undefined {
  const key = OPENGRAPH_PREFIX + url;
  return this.get<OgCacheEntry>(key);
}

export function setOpenGraphData(this: ICache, url: string, data: OgResult, isFailure = false): void {
  const key = OPENGRAPH_PREFIX + url;
  const now = Date.now();
  const existing = getOpenGraphData.call(this, url);

  const validationResult = ogResultSchema.safeParse(data);
  const validatedData: OgResult = validationResult.success
    ? { ...validationResult.data, url: data.url }
    : { ...data, timestamp: data.timestamp || now };

  if (!validationResult.success) {
    console.warn(`[ServerCache] OpenGraph data failed strict validation for ${url} – caching anyway.`);
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
    const timeSinceLastAttempt = Date.now() - cached.lastAttemptedAt;
    return timeSinceLastAttempt > OPENGRAPH_CACHE_DURATION.FAILURE * 1000;
  }

  const timeSinceLastFetch = Date.now() - cached.lastFetchedAt;
  return timeSinceLastFetch > OPENGRAPH_CACHE_DURATION.SUCCESS * 1000;
}

export function clearOpenGraphData(this: ICache, url?: string): void {
  if (url) {
    const key = OPENGRAPH_PREFIX + url;
    this.del(key);
  } else {
    const keys = this.keys().filter((key) => key.startsWith(OPENGRAPH_PREFIX));
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
  console.log(`[ServerCache] Deleted corrupted OpenGraph cache entry: ${url}`);
}

/**
 * Invalidate OpenGraph cache when image URLs become stale (e.g., 404s)
 * This automatically triggers a background refresh to get updated image URLs
 */
export function invalidateStaleOpenGraphData(this: ICache, pageUrl: string, reason: string): boolean {
  const refreshKey = REFRESH_TRACKING_PREFIX + pageUrl;
  const lastRefresh = this.get<number>(refreshKey);
  const now = Date.now();

  // Check if we recently attempted a refresh (cooldown period)
  if (lastRefresh && now - lastRefresh < REFRESH_COOLDOWN_MS) {
    const remainingCooldown = Math.round((REFRESH_COOLDOWN_MS - (now - lastRefresh)) / 1000);
    console.log(
      `[ServerCache] Skipping OpenGraph refresh for ${pageUrl} - in cooldown period (${remainingCooldown}s remaining)`,
    );
    return false;
  }

  // Invalidate the cached OpenGraph data
  try {
    deleteOpenGraphData.call(this, pageUrl);
  } catch (error) {
    console.error(`[ServerCache] Failed to delete OpenGraph data for ${pageUrl}:`, error);
    return false;
  }

  // Track this refresh attempt
  this.set(refreshKey, now, REFRESH_COOLDOWN_MS / 1000);

  console.log(`[OpenGraph Auto-Recovery] 🔄 Invalidated stale cache for ${pageUrl}. Reason: ${reason}`);
  console.log(`[OpenGraph Auto-Recovery] ⏱️ Next refresh allowed in ${Math.round(REFRESH_COOLDOWN_MS / 1000)}s`);
  return true;
}
