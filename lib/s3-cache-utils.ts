/**
 * S3 Cache Utilities
 * 
 * Provides cached versions of S3 operations using Next.js 15's 'use cache' directive
 * for improved performance and reduced S3 API calls.
 * 
 * @module lib/s3-cache-utils
 */

import { readJsonS3, checkIfS3ObjectExists } from "./s3-utils";
import { USE_NEXTJS_CACHE } from "./constants";
import { withCacheFallback } from "./cache";
import { unstable_cacheLife as cacheLife, unstable_cacheTag as cacheTag } from "next/cache";

// Type assertions for cache functions
const safeCacheLife = cacheLife as (profile: string) => void;
const safeCacheTag = cacheTag as (tag: string) => void;

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
  cacheProfile: "minutes" | "hours" | "days" | "weeks" = "hours",
  tags: string[] = [],
): Promise<T | null> {
  "use cache";
  
  safeCacheLife(cacheProfile);
  safeCacheTag("s3-json");
  safeCacheTag(`s3-key-${s3Key.replace(/[^a-zA-Z0-9-]/g, "-")}`);
  tags.forEach(tag => safeCacheTag(tag));
  
  return readJsonS3<T>(s3Key);
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
  options: {
    useCache?: boolean;
    cacheProfile?: "minutes" | "hours" | "days" | "weeks";
    tags?: string[];
  } = {},
): Promise<T | null> {
  // Default to true unless explicitly set to false
  const { useCache = options.useCache !== false && USE_NEXTJS_CACHE, cacheProfile = "hours", tags = [] } = options;
  
  if (useCache) {
    return withCacheFallback<T | null>(
      () => getCachedJsonS3<T>(s3Key, cacheProfile, tags),
      () => readJsonS3<T>(s3Key),
    );
  }
  
  return readJsonS3<T>(s3Key);
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
  safeCacheTag(`s3-exists-${s3Key.replace(/[^a-zA-Z0-9-]/g, "-")}`);
  
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
  const { useCache = options.useCache !== false && USE_NEXTJS_CACHE, cacheProfile = "hours" } = options;
  
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
 * @param options - Cache options
 * @returns Promise resolving to an array of results
 */
export async function batchReadJsonS3Cached<T>(
  s3Keys: string[],
  options: {
    useCache?: boolean;
    cacheProfile?: "minutes" | "hours" | "days" | "weeks";
    tags?: string[];
  } = {},
): Promise<(T | null)[]> {
  return Promise.all(
    s3Keys.map(key => readJsonS3Cached<T>(key, options))
  );
}