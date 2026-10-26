/**
 * OpenGraph Data Validation Schemas
 * @module lib/schemas/opengraph
 * @description
 * Zod schemas for runtime validation of OpenGraph data from external APIs.
 * Provides type-safe parsing and validation at system boundaries.
 */

import {
  ogMetadataSchema,
  ogFetchResultSchema,
  ogCacheEntrySchema,
  type ValidatedOgMetadata,
  type ValidatedOgFetchResult,
  type ValidatedOgCacheEntry,
} from "@/types/seo/opengraph";

/** A publisher's verification screen is not metadata or article content. */
export function isAccessChallenge(
  title: string | null | undefined,
  content?: string | null,
): boolean {
  if (
    /^(?:enable javascript and cookies to continue[.!]?|this is a bot verification page\b[\s\S]*actual article(?: content)? (?:was )?not retrieved[\s\S]*)$/i.test(
      content?.trim() ?? "",
    )
  ) {
    return true;
  }
  const challengeTitle =
    /^(?:just a moment(?:\.{3}|…)?|attention required!?|access denied|security verification)$/i.test(
      title?.trim() ?? "",
    );
  return (
    challengeTitle &&
    (!content?.trim() ||
      /cloudflare|(?:bot|browser|security)[ -]verification|enable javascript and cookies|verifying (?:that )?you are human|challenge-platform|cf-chl/i.test(
        content,
      ))
  );
}

/**
 * Utility function to safely parse OpenGraph metadata
 * @param data - Raw data from external API
 * @returns Validated metadata or null if invalid
 */
export function parseOgMetadata(data: unknown): ValidatedOgMetadata | null {
  const result = ogMetadataSchema.safeParse(data);
  if (!result.success) {
    console.warn("OpenGraph metadata validation failed:", result.error.message);
    return null;
  }
  return result.data;
}

/**
 * Utility function to safely parse OpenGraph fetch results
 * @param data - Raw data from external API
 * @returns Validated result or null if invalid
 */
export function parseOgFetchResult(data: unknown): ValidatedOgFetchResult | null {
  const result = ogFetchResultSchema.safeParse(data);
  if (!result.success) {
    console.warn("OpenGraph fetch result validation failed:", result.error.message);
    return null;
  }
  return result.data;
}

/**
 * Utility function to create a validated cache entry
 * @param data - Raw cache data
 * @returns Validated cache entry or null if invalid
 */
export function parseOgCacheEntry(data: unknown): ValidatedOgCacheEntry | null {
  const result = ogCacheEntrySchema.safeParse(data);
  if (!result.success) {
    console.warn("OpenGraph cache entry validation failed:", result.error.message);
    return null;
  }
  return result.data;
}

/**
 * Default/empty OpenGraph metadata for fallback cases
 */
export const defaultOgMetadata: ValidatedOgMetadata = {
  title: null,
  description: null,
  image: null,
  twitterImage: null,
  site: null,
  type: null,
  profileImage: null,
  bannerImage: null,
  url: null,
  siteName: null,
};
