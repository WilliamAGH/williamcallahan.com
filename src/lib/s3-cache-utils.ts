/**
 * S3 Read Caching Utilities
 *
 * Provides a caching layer for S3 read operations using Next.js's 'use cache' directive.
 * This reduces S3 API calls by caching results - S3 itself is persistent storage, NOT a cache.
 *
 * @module lib/s3-cache-utils
 */

import type { ZodSchema } from "zod/v4";
import { readJsonS3, readJsonS3Optional } from "./s3/json";
import { checkIfS3ObjectExists } from "./s3/objects";
import { USE_NEXTJS_CACHE } from "./constants";
import { withCacheFallback } from "./cache";
import { cacheContextGuards } from "@/lib/cache";
import { sanitizeCacheTag } from "@/lib/utils/sanitize";

// Runtime-safe wrappers for cache functions
const safeCacheLife = (
  profile:
    | "default"
    | "seconds"
    | "minutes"
    | "hours"
    | "days"
    | "weeks"
    | "max"
    | { stale?: number; revalidate?: number; expire?: number },
): void => {
  cacheContextGuards.cacheLife("S3Cache", profile);
};
const safeCacheTag = (tag: string): void => {
  cacheContextGuards.cacheTag("S3Cache", tag);
};

/**
 * Cached JSON read from S3 with 'use cache' directive
 * @template T The expected type of the JSON data
 * @param s3Key - The S3 key to read
 * @param cacheProfile - Cache duration profile: "minutes" | "hours" | "days" | "weeks"
 * @param tags - Additional cache tags for granular invalidation
 * @returns Promise resolving to the parsed JSON data or null
 */
async function getCachedJsonS3<T>(
  s3Key: string,
  schema: ZodSchema<T>,
  cacheProfile: "minutes" | "hours" | "days" | "weeks" = "hours",
  tags: string[] = [],
): Promise<T> {
  "use cache";

  safeCacheLife(cacheProfile);
  safeCacheTag("s3-json");
  safeCacheTag(`s3-key-${sanitizeCacheTag(s3Key)}`);
  tags.forEach((tag) => safeCacheTag(sanitizeCacheTag(tag)));

  return readJsonS3<T>(s3Key, schema);
}

async function getCachedJsonS3Optional<T>(
  s3Key: string,
  schema: ZodSchema<T>,
  cacheProfile: "minutes" | "hours" | "days" | "weeks" = "hours",
  tags: string[] = [],
): Promise<T | null> {
  "use cache";

  safeCacheLife(cacheProfile);
  safeCacheTag("s3-json");
  safeCacheTag(`s3-key-${sanitizeCacheTag(s3Key)}`);
  tags.forEach((tag) => safeCacheTag(sanitizeCacheTag(tag)));

  return readJsonS3Optional<T>(s3Key, schema);
}

/**
 * Read JSON from S3 with optional caching
 * @template T The expected type of the JSON data
 * @param s3Key - The S3 key to read
 * @param options - Cache options
 * @returns Promise resolving to the parsed JSON data or null
 */
export async function readJsonS3Cached<T>(
  s3Key: string,
  schema: ZodSchema<T>,
  options: {
    useCache?: boolean;
    cacheProfile?: "minutes" | "hours" | "days" | "weeks";
    tags?: string[];
  } = {},
): Promise<T> {
  // Default to true unless explicitly set to false
  const {
    useCache = options.useCache !== false && USE_NEXTJS_CACHE,
    cacheProfile = "hours",
    tags = [],
  } = options;

  if (useCache) {
    return withCacheFallback<T>(
      () => getCachedJsonS3<T>(s3Key, schema, cacheProfile, tags),
      () => readJsonS3<T>(s3Key, schema),
    );
  }

  return readJsonS3<T>(s3Key, schema);
}

export async function readJsonS3CachedOptional<T>(
  s3Key: string,
  schema: ZodSchema<T>,
  options: {
    useCache?: boolean;
    cacheProfile?: "minutes" | "hours" | "days" | "weeks";
    tags?: string[];
  } = {},
): Promise<T | null> {
  const {
    useCache = options.useCache !== false && USE_NEXTJS_CACHE,
    cacheProfile = "hours",
    tags = [],
  } = options;

  if (useCache) {
    return withCacheFallback<T | null>(
      () => getCachedJsonS3Optional<T>(s3Key, schema, cacheProfile, tags),
      () => readJsonS3Optional<T>(s3Key, schema),
    );
  }

  return readJsonS3Optional<T>(s3Key, schema);
}

/**
 * Cached S3 existence check with 'use cache' directive
 * @param s3Key - The S3 key to check
 * @param cacheProfile - Cache duration profile
 * @returns Promise resolving to true if the object exists
 */
function getCachedS3Exists(
  s3Key: string,
  cacheProfile: "minutes" | "hours" | "days" = "hours",
): Promise<boolean> {
  "use cache";

  safeCacheLife(cacheProfile);
  safeCacheTag("s3-exists");
  safeCacheTag(`s3-exists-${sanitizeCacheTag(s3Key)}`);

  return checkIfS3ObjectExists(s3Key);
}

/**
 * Check S3 object existence with optional caching
 * @param s3Key - The S3 key to check
 * @param options - Cache options
 * @returns Promise resolving to true if the object exists
 */
export async function checkS3ExistsCached(
  s3Key: string,
  options: {
    useCache?: boolean;
    cacheProfile?: "minutes" | "hours" | "days";
  } = {},
): Promise<boolean> {
  // Default to true unless explicitly set to false
  const { useCache = options.useCache !== false && USE_NEXTJS_CACHE, cacheProfile = "hours" } =
    options;

  if (useCache) {
    return withCacheFallback<boolean>(
      () => getCachedS3Exists(s3Key, cacheProfile),
      () => checkIfS3ObjectExists(s3Key),
    );
  }

  return checkIfS3ObjectExists(s3Key);
}

/**
 * Batch read multiple JSON files from S3 with caching
 * @param s3Keys - Array of S3 keys to read
 * @param schema - Zod schema for validation
 * @param options - Cache options
 * @returns Promise resolving to an array of results
 */
export async function batchReadJsonS3Cached<T>(
  s3Keys: string[],
  schema: ZodSchema<T>,
  options: {
    useCache?: boolean;
    cacheProfile?: "minutes" | "hours" | "days" | "weeks";
    tags?: string[];
  } = {},
): Promise<(T | null)[]> {
  return Promise.all(s3Keys.map((key) => readJsonS3CachedOptional<T>(key, schema, options)));
}
