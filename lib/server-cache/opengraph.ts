/**
 * @module lib/server-cache/opengraph
 * @description Domain-specific cache methods for OpenGraph data.
 * These methods are intended to be attached to the ServerCache prototype.
 */

import type { OgCacheEntry, ICache } from "@/types/cache";
import type { OgResult } from "@/types/opengraph";
import { ogResultSchema } from "@/types/seo/opengraph";
import { OPENGRAPH_CACHE_DURATION } from "@/lib/constants";

const OPENGRAPH_PREFIX = "og-data:";

export function getOpenGraphData(this: ICache, url: string): OgCacheEntry | undefined {
  const key = OPENGRAPH_PREFIX + url;
  return this.get<OgCacheEntry>(key);
}

export function setOpenGraphData(this: ICache, url: string, data: OgResult, isFailure = false): void {
  const key = OPENGRAPH_PREFIX + url;
  const now = Date.now();
  const existing = getOpenGraphData.call(this, url);

  const validationResult = ogResultSchema.safeParse(data);
  const validatedData: OgResult = validationResult.success ? { ...validationResult.data, url: data.url } : data;

  if (!validationResult.success) {
    console.warn(`[ServerCache] OpenGraph data failed strict validation for ${url} – caching anyway.`);
  }

  const cacheEntry: OgCacheEntry = {
    ...validatedData,
    url,
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
