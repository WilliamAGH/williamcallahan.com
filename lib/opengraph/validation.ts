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
