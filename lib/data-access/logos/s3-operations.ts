/**
 * S3 Operations for Logos
 *
 * @module data-access/logos/s3-operations
 */

import type { LogoSource } from '@/types/logo';
import { listS3Objects, readBinaryS3 } from '@/lib/s3-utils';
import { LOGOS_S3_KEY_DIR } from './config';
import logger from '@/lib/utils/logger';
import { isDebug } from '@/lib/utils/debug';

/**
 * Constructs the S3 object key for a company logo using the domain and logo source.
 *
 * @param domain - The domain name associated with the logo
 * @param source - The logo source identifier
 * @param ext - The file extension for the logo (default: 'png')
 * @returns The S3 key string for storing or retrieving the logo
 */
export function getLogoS3Key(
  domain: string,
  source: LogoSource,
  ext: 'png' | 'svg' = 'png'
): string {
  const id = domain.split('.')[0];
  return `${LOGOS_S3_KEY_DIR}/${id}_${source}.${ext}`;
}

/**
 * Searches for a logo associated with the given domain in S3 storage.
 *
 * Uses simple prefix listing on the domain slug (before first dot) to find matching keys.
 *
 * @param domain - The domain to search for a logo
 * @returns Logo buffer, source, and S3 key, or null if not found
 */
export async function findLogoInS3(
  domain: string
): Promise<{ buffer: Buffer; source: LogoSource; key: string } | null> {
  const id = domain.split('.')[0];
  const prefix = `${LOGOS_S3_KEY_DIR}/${id}_`;

  let keys: string[];
  try {
    keys = await listS3Objects(prefix);
  } catch (error) {
    if (isDebug) logger.warn(`[DataAccess/Logos-S3] Error listing S3 objects for prefix ${prefix}:`, error);
    return null;
  }

  if (!keys || keys.length === 0) {
    return null;
  }

  const pngKey = keys.find(k => k.endsWith('.png'));
  const bestKey = pngKey ?? keys[0];

  try {
    const buffer = await readBinaryS3(bestKey);
    if (buffer) {
      let source: LogoSource = 'unknown';
      if (bestKey.includes('_google')) source = 'google';
      else if (bestKey.includes('_clearbit')) source = 'clearbit';
      else if (bestKey.includes('_ddg')) source = 'duckduckgo';
      if (isDebug) logger.debug(`[DataAccess/Logos-S3] Found logo for ${domain}: ${bestKey}`);
      return { buffer, source, key: bestKey };
    }
  } catch (error) {
    if (isDebug) logger.warn(`[DataAccess/Logos-S3] Error reading S3 object ${bestKey}:`, error);
  }

  return null;
}
