/**
 * @module lib/server-cache/logo
 * @description Domain-specific cache methods for logos.
 * These methods are intended to be attached to the ServerCache prototype.
 */

import type { LogoValidationResult, LogoFetchResult, InvertedLogoEntry, ICache } from "@/types/cache";
import type { LogoInversion } from "@/types/logo";
import { LOGO_CACHE_DURATION } from "@/lib/constants";
import { getMonotonicTime } from "@/lib/utils";

const LOGO_VALIDATION_PREFIX = "logo-validation:";
const LOGO_FETCH_PREFIX = "logo-fetch:";
const INVERTED_LOGO_PREFIX = "logo-inverted:";
const LOGO_ANALYSIS_PREFIX = "logo-analysis:";

const isProductionBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
const getCacheTimestamp = (): number => (isProductionBuildPhase ? 0 : getMonotonicTime());

export function getLogoValidation(cache: ICache, imageHash: string): LogoValidationResult | undefined {
  const key = LOGO_VALIDATION_PREFIX + imageHash;
  return cache.get<LogoValidationResult>(key);
}

export function setLogoValidation(cache: ICache, imageHash: string, isGlobeIcon: boolean): void {
  const key = LOGO_VALIDATION_PREFIX + imageHash;
  cache.set(key, {
    isGlobeIcon,
    timestamp: getCacheTimestamp(),
  });
}

export function getLogoFetch(cache: ICache, domain: string): LogoFetchResult | undefined {
  const key = LOGO_FETCH_PREFIX + domain;
  return cache.get<LogoFetchResult>(key);
}

export function setLogoFetch(cache: ICache, domain: string, result: Partial<LogoFetchResult>): void {
  const key = LOGO_FETCH_PREFIX + domain;
  const entryToCache = {
    ...result,
    timestamp: getCacheTimestamp(),
  };

  // Ensure buffer is not cached
  if ("buffer" in entryToCache) {
    delete (entryToCache as Partial<LogoFetchResult>).buffer;
  }

  cache.set(key, entryToCache, result.error ? LOGO_CACHE_DURATION.FAILURE : LOGO_CACHE_DURATION.SUCCESS);
}

export function clearLogoFetch(cache: ICache, domain: string): void {
  const key = LOGO_FETCH_PREFIX + domain;
  cache.del(key);
}

export function clearAllLogoFetches(cache: ICache): void {
  const keys = cache.keys().filter(key => key.startsWith(LOGO_FETCH_PREFIX));
  for (const key of keys) {
    cache.del(key);
  }
}

export function getInvertedLogo(cache: ICache, cacheKey: string): InvertedLogoEntry | undefined {
  const key = INVERTED_LOGO_PREFIX + cacheKey;
  return cache.get<InvertedLogoEntry>(key);
}

export function setInvertedLogo(cache: ICache, cacheKey: string, entry: Omit<InvertedLogoEntry, "timestamp">): void {
  const key = INVERTED_LOGO_PREFIX + cacheKey;
  cache.set(key, {
    ...entry,
    timestamp: getCacheTimestamp(),
  });
}

export function getLogoAnalysis(cache: ICache, cacheKey: string): LogoInversion | undefined {
  const key = LOGO_ANALYSIS_PREFIX + cacheKey;
  return cache.get<LogoInversion>(key);
}

export function setLogoAnalysis(cache: ICache, cacheKey: string, analysis: LogoInversion): void {
  const key = LOGO_ANALYSIS_PREFIX + cacheKey;
  cache.set(key, analysis);
}
