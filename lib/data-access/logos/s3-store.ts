/**
 * S3 logo key store - caches S3 object keys in memory
 *
 * Purpose: Avoid redundant S3 listObjects calls
 * Features: Lazy initialization, key addition, cache invalidation
 *
 * @module data-access/logos/s3-store
 */

import { listS3Objects } from "@/lib/s3-utils";
import { LOGOS_S3_KEY_DIR } from "./config";

// Store S3 logo keys to avoid repeated listing calls
let s3LogoKeys: Set<string> | null = null;
let isInitialized = false;

/**
 * Initializes the S3 logo key store by fetching all keys from S3.
 */
async function initializeS3LogoKeys(): Promise<void> {
  if (isInitialized) return;
  try {
    const keys = await listS3Objects(LOGOS_S3_KEY_DIR);
    s3LogoKeys = new Set(keys);
    isInitialized = true;
  } catch (error) {
    console.error("Failed to initialize S3 logo key store:", error);
    s3LogoKeys = new Set(); // Initialize as empty set on error
  }
}

/**
 * Retrieves all known S3 logo keys, initializing the store if necessary.
 *
 * @returns A promise that resolves to a Set of S3 logo keys.
 */
export async function getS3LogoKeys(): Promise<Set<string>> {
  if (!s3LogoKeys) {
    await initializeS3LogoKeys();
  }
  return s3LogoKeys ?? new Set();
}

/**
 * Adds a new key to the in-memory S3 logo key store.
 *
 * @param key - The S3 key to add.
 */
export function addKeyToS3LogoStore(key: string): void {
  s3LogoKeys?.add(key);
}

/**
 * Invalidates the S3 logo key store, forcing a re-fetch on the next call.
 */
export function invalidateS3LogoKeysStore(): void {
  s3LogoKeys = null;
  isInitialized = false;
}
