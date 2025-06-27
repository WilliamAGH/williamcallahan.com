/**
 * Hash Utilities
 * 
 * Consistent hashing functions for cache keys, file identification,
 * and deduplication across the application
 */

import { createHash } from 'node:crypto';

/**
 * Generate SHA-256 hash from string input
 * Returns full hex string (64 characters)
 */
export function generateHash(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Generate hash from Buffer (for file content hashing)
 * Useful for deduplication and cache keys
 */
export function getBufferHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Generate cache key from multiple inputs
 * Filters out falsy values and joins with delimiter
 */
export function getCacheKey(inputs: (string | number | boolean | undefined | null)[], delimiter = ':'): string {
  const filtered = inputs.filter(Boolean);
  const combined = filtered.join(delimiter);
  return generateHash(combined);
}

/**
 * Generate a short hash (first N characters)
 * Useful for file naming where full hash is too long
 */
export function getShortHash(input: string, length = 8): string {
  return generateHash(input).substring(0, length);
}

/**
 * Generate hash with prefix for easier identification
 * e.g., 'img_a1b2c3d4' or 'cache_e5f6g7h8'
 */
export function getPrefixedHash(input: string, prefix: string, length = 8): string {
  const hash = generateHash(input).substring(0, length);
  return `${prefix}_${hash}`;
}

/**
 * Check if two buffers have the same content by comparing hashes
 * More efficient than direct buffer comparison for large buffers
 */
export function buffersMatch(buffer1: Buffer, buffer2: Buffer): boolean {
  // Quick length check first
  if (buffer1.length !== buffer2.length) return false;
  
  // Compare hashes for efficiency
  return getBufferHash(buffer1) === getBufferHash(buffer2);
}

/**
 * Generate deterministic hash for object
 * Sorts keys to ensure consistent hashing regardless of property order
 */
export function getObjectHash(obj: Record<string, unknown>): string {
  const sortedJson = JSON.stringify(obj, Object.keys(obj).sort());
  return generateHash(sortedJson);
}

/**
 * Generate hash for file path + modification time
 * Useful for cache invalidation based on file changes
 */
export function getFileHash(filePath: string, mtime?: Date | number): string {
  const mtimeStr = mtime ? new Date(mtime).toISOString() : '';
  return generateHash(`${filePath}:${mtimeStr}`);
}