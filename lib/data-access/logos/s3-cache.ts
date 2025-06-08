/**
 * S3 Logo Key Cache Management
 *
 * @module data-access/logos/s3-cache
 */

import { listS3Objects as s3UtilsListS3Objects } from '@/lib/s3-utils';
import { LOGOS_S3_KEY_DIR } from './config';
import { isDebug } from '@/lib/utils/debug';

// Cache S3 logo keys to avoid repeated listing calls
let ALL_S3_LOGO_KEYS: string[] | null = null;

/**
 * Lists all S3 logo keys, using a cache to avoid repeated S3 calls.
 * @returns A promise that resolves to an array of S3 logo keys.
 */
export async function listAllS3LogoKeys(): Promise<string[]> {
  if (ALL_S3_LOGO_KEYS === null) {
    ALL_S3_LOGO_KEYS = await s3UtilsListS3Objects(`${LOGOS_S3_KEY_DIR}/`);
  }
  return ALL_S3_LOGO_KEYS;
}

/**
 * Adds a new key to the in-memory S3 logo key cache if it has been initialized.
 * This prevents the need to re-list all S3 objects after a new logo is uploaded.
 * @param key The S3 key to add to the cache.
 */
export function addKeyToS3LogoCache(key: string): void {
  if (ALL_S3_LOGO_KEYS !== null && !ALL_S3_LOGO_KEYS.includes(key)) {
    ALL_S3_LOGO_KEYS.push(key);
    if (isDebug) console.log(`[DataAccess/Logos-S3] Added new key to S3 logo cache: ${key}`);
  }
}

/**
 * Invalidates the S3 logo keys cache to ensure fresh data after uploads.
 * Should be called whenever new logos are uploaded to S3.
 */
export function invalidateS3LogoKeysCache(): void {
  ALL_S3_LOGO_KEYS = null;
  if (isDebug) console.log('[DataAccess/Logos] S3 logo keys cache invalidated.');
}
