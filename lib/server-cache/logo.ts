/**
 * @module lib/server-cache/logo
 * @description Domain-specific cache methods for logos.
 * These methods are intended to be attached to the ServerCache prototype.
 */

import type { LogoValidationResult, LogoFetchResult, InvertedLogoEntry, ICache } from "@/types/cache";
import type { LogoInversion } from "@/types/logo";
import { LOGO_CACHE_DURATION } from "@/lib/constants";

const LOGO_VALIDATION_PREFIX = "logo-validation:";
const LOGO_FETCH_PREFIX = "logo-fetch:";
const INVERTED_LOGO_PREFIX = "logo-inverted:";
const LOGO_ANALYSIS_PREFIX = "logo-analysis:";

const getCacheTimestamp = (): number => (process.env.NEXT_PHASE === "phase-production-build" ? 0 : Date.now());

export function getLogoValidation(this: ICache, imageHash: string): LogoValidationResult | undefined {
  const key = LOGO_VALIDATION_PREFIX + imageHash;
  return this.get<LogoValidationResult>(key);
}

export function setLogoValidation(this: ICache, imageHash: string, isGlobeIcon: boolean): void {
  const key = LOGO_VALIDATION_PREFIX + imageHash;
  this.set(key, {
    isGlobeIcon,
    timestamp: getCacheTimestamp(),
  });
}

export function getLogoFetch(this: ICache, domain: string): LogoFetchResult | undefined {
  const key = LOGO_FETCH_PREFIX + domain;
  return this.get<LogoFetchResult>(key);
}

export function setLogoFetch(this: ICache, domain: string, result: Partial<LogoFetchResult>): void {
  const key = LOGO_FETCH_PREFIX + domain;
  const entryToCache = {
    ...result,
    timestamp: getCacheTimestamp(),
  };

  // Ensure buffer is not cached
  if ("buffer" in entryToCache) {
    delete (entryToCache as Partial<LogoFetchResult>).buffer;
  }

  this.set(key, entryToCache, result.error ? LOGO_CACHE_DURATION.FAILURE : LOGO_CACHE_DURATION.SUCCESS);
}

export function clearLogoFetch(this: ICache, domain: string): void {
  const key = LOGO_FETCH_PREFIX + domain;
  this.del(key);
}

export function clearAllLogoFetches(this: ICache): void {
  const keys = this.keys().filter(key => key.startsWith(LOGO_FETCH_PREFIX));
  for (const key of keys) {
    this.del(key);
  }
}

export function getInvertedLogo(this: ICache, cacheKey: string): InvertedLogoEntry | undefined {
  const key = INVERTED_LOGO_PREFIX + cacheKey;
  return this.get<InvertedLogoEntry>(key);
}

export function setInvertedLogo(this: ICache, cacheKey: string, entry: Omit<InvertedLogoEntry, "timestamp">): void {
  const key = INVERTED_LOGO_PREFIX + cacheKey;
  this.set(key, {
    ...entry,
    timestamp: getCacheTimestamp(),
  });
}

export function getLogoAnalysis(this: ICache, cacheKey: string): LogoInversion | undefined {
  const key = LOGO_ANALYSIS_PREFIX + cacheKey;
  return this.get<LogoInversion>(key);
}

export function setLogoAnalysis(this: ICache, cacheKey: string, analysis: LogoInversion): void {
  const key = LOGO_ANALYSIS_PREFIX + cacheKey;
  this.set(key, analysis);
}
