import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Local directory where build-time scripts persist S3 snapshots.
 * Path mirrors the remote key structure so callers can join S3 keys directly.
 */
export const LOCAL_S3_CACHE_DIR =
  (process.env.LOCAL_S3_CACHE_DIR && process.env.LOCAL_S3_CACHE_DIR.trim()) ||
  path.join(process.cwd(), ".next", "cache", "local-s3");

/**
 * Resolve an absolute filesystem path for a given S3 key inside the local cache.
 */
export function getLocalS3Path(s3Key: string): string {
  const normalizedKey = s3Key.replace(/^\/+/, "");
  return path.join(LOCAL_S3_CACHE_DIR, normalizedKey);
}

import type { ZodSchema } from "zod/v4";

/**
 * Read JSON content for a given S3 key from the local cache directory.
 * Returns null when the cached file does not exist.
 *
 * @overload With schema - validates and returns typed result
 * @overload Without schema - returns unknown for caller to validate
 */
export async function readLocalS3Json<T>(s3Key: string, schema: ZodSchema<T>): Promise<T | null>;
export async function readLocalS3Json(s3Key: string): Promise<unknown>;
export async function readLocalS3Json<T>(
  s3Key: string,
  schema?: ZodSchema<T>,
): Promise<T | unknown | null> {
  const filePath = getLocalS3Path(s3Key);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (schema) {
      const result = schema.safeParse(parsed);
      if (result.success) {
        return result.data;
      }
      console.warn(`[LocalS3Cache] Validation failed for ${s3Key}:`, result.error.message);
      return null;
    }
    return parsed;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code !== "ENOENT") {
      console.warn(`[LocalS3Cache] Failed to read ${s3Key} from ${filePath}:`, error);
    }
    return null;
  }
}

/**
 * Safe wrapper for readLocalS3Json that respects skip conditions.
 * Use this when you need to conditionally skip local cache reads based on environment.
 *
 * @param s3Key - The S3 key to read from local cache
 * @param shouldSkip - Whether to skip the local cache read
 * @param schema - Optional Zod schema for validation (recommended for type safety)
 * @returns The parsed JSON data, or `null` in these cases:
 *   - `shouldSkip` is true (cache intentionally bypassed)
 *   - File does not exist at the expected path (cache miss)
 *   - File exists but JSON parsing fails (logged as warning, returns null)
 *   - Schema validation fails (when schema provided)
 * @example
 * ```ts
 * // With schema (recommended - provides runtime validation)
 * const data = await readLocalS3JsonSafe(key, shouldSkipLocalS3Cache, mySchema);
 *
 * // Without schema (caller assumes type - use with caution)
 * const data = await readLocalS3JsonSafe<MyType>(key, shouldSkipLocalS3Cache);
 * ```
 */
export async function readLocalS3JsonSafe<T>(
  s3Key: string,
  shouldSkip: boolean,
  schema?: ZodSchema<T>,
): Promise<T | null> {
  if (shouldSkip) {
    return null;
  }
  if (schema) {
    return readLocalS3Json(s3Key, schema);
  }
  // Without schema, caller is responsible for type safety
  return readLocalS3Json(s3Key) as T | null;
}
