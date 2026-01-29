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

export function getOpenGraphData(cache: ICache, url: string): OgCacheEntry | undefined {
  const key = OPENGRAPH_PREFIX + url;
  return cache.get<OgCacheEntry>(key);
}

export function setOpenGraphData(cache: ICache, url: string, data: OgResult, isFailure = false): void {
  const key = OPENGRAPH_PREFIX + url;
  const now = getCacheTimestamp();
  const existing = getOpenGraphData(cache, url);

  const validationResult = ogResultSchema.safeParse(data);
  const normalizedData: OgResult = {
    ...data,
    finalUrl: data.finalUrl ?? undefined,
    title: data.title ?? undefined,
    description: data.description ?? undefined,
    siteName: data.siteName ?? undefined,
    locale: data.locale ?? undefined,
    actualUrl: data.actualUrl ?? undefined,
  };
  let validatedData: OgResult;
  if (validationResult.success) {
    const validated = validationResult.data;
    validatedData = {
      ...normalizedData,
      ...validated,
      url: data.url,
      timestamp: validationResult.data.timestamp ?? normalizedData.timestamp ?? now,
      finalUrl: validationResult.data.finalUrl ?? normalizedData.finalUrl,
      title: validationResult.data.title ?? normalizedData.title,
      description: validationResult.data.description ?? normalizedData.description,
      siteName: validationResult.data.siteName ?? normalizedData.siteName,
      locale: validationResult.data.locale ?? normalizedData.locale,
      actualUrl: validationResult.data.actualUrl ?? normalizedData.actualUrl,
      errorDetails: normalizedData.errorDetails,
    };
  } else {
    validatedData = { ...normalizedData, timestamp: normalizedData.timestamp || now };
  }

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

  cache.set(key, cacheEntry, isFailure ? OPENGRAPH_CACHE_DURATION.FAILURE : OPENGRAPH_CACHE_DURATION.SUCCESS);
}

export function shouldRefreshOpenGraph(cache: ICache, url: string): boolean {
  const cached = getOpenGraphData(cache, url);
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

export function clearOpenGraphData(cache: ICache, url?: string): void {
  if (url) {
    const key = OPENGRAPH_PREFIX + url;
    cache.del(key);
  } else {
    const keys = cache.keys().filter(key => key.startsWith(OPENGRAPH_PREFIX));
    for (const key of keys) {
      cache.del(key);
    }
  }
}

/**
 * Delete specific OpenGraph cache entry (for corruption recovery)
 */
export function deleteOpenGraphData(cache: ICache, url: string): void {
  const key = OPENGRAPH_PREFIX + url;
  cache.del(key);
  envLogger.log(`Deleted corrupted OpenGraph cache entry`, { url }, { category: "ServerCache" });
}

/**
 * Invalidate OpenGraph cache when image URLs become stale (e.g., 404s)
 * This automatically triggers a background refresh to get updated image URLs
 */
export function invalidateStaleOpenGraphData(cache: ICache, pageUrl: string, reason: string): boolean {
  const refreshKey = REFRESH_TRACKING_PREFIX + pageUrl;
  const lastRefresh = cache.get<number>(refreshKey);
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
    deleteOpenGraphData(cache, pageUrl);
  } catch (error) {
    envLogger.log(
      `Failed to delete OpenGraph data for ${pageUrl}`,
      { error: error instanceof Error ? error.message : String(error), pageUrl },
      { category: "ServerCache" },
    );
    return false;
  }

  // Track this refresh attempt
  cache.set(refreshKey, now, REFRESH_COOLDOWN_MS / 1000);

  envLogger.log(
    `OpenGraph Auto-Recovery: Invalidated stale cache`,
    { pageUrl, reason, nextRefreshAllowedInSeconds: Math.round(REFRESH_COOLDOWN_MS / 1000) },
    { category: "OpenGraphAutoRecovery" },
  );
  return true;
}
