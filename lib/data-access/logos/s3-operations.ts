/**
 * S3 Operations for Logos
 *
 * @module data-access/logos/s3-operations
 */

import type { LogoSource } from '@/types';
import { readBinaryS3 } from '@/lib/s3-utils';
import { createHash } from 'node:crypto';
import { listAllS3LogoKeys } from './s3-cache';
import { LOGOS_S3_KEY_DIR } from './config';
import { isDebug } from '@/lib/utils/debug';

/**
 * Constructs the S3 object key for a company logo using the domain and logo source.
 *
 * @param domain - The domain name associated with the logo
 * @param source - The logo source identifier
 * @param ext - The file extension for the logo (default: 'png')
 * @returns The S3 key string for storing or retrieving the logo
 */
export function getLogoS3Key(domain: string, source: LogoSource, ext: 'png' | 'svg' = 'png'): string {
  // Use a hash of the full domain to prevent collisions while keeping keys readable
  const domainHash = createHash('md5').update(domain).digest('hex').substring(0, 8);
  const id: string = domain.split('.')[0];
  const sourceAbbr: string = source === 'duckduckgo' ? 'ddg' : (source ?? 'unknown');
  return `${LOGOS_S3_KEY_DIR}/${id}_${domainHash}_${sourceAbbr}.${ext}`;
}

/**
 * Searches for a logo associated with the given domain in S3 storage.
 *
 * Checks known sources (Google, Clearbit, DuckDuckGo) and falls back to prefix matching.
 *
 * @param domain - The domain to search for a logo
 * @returns Promise with logo buffer and source, or null if not found
 */
export async function findLogoInS3(domain: string): Promise<{ buffer: Buffer; source: LogoSource } | null> {
  const domainHash = createHash('md5').update(domain).digest('hex').substring(0, 8);
  const id: string = domain.split('.')[0];
  const allKeys = await listAllS3LogoKeys();
  
  try {
    const keys: string[] = allKeys.filter(key => key.startsWith(`${LOGOS_S3_KEY_DIR}/${id}_${domainHash}_`));
    if (keys.length > 0) {
      const pngKey: string | undefined = keys.find(key => key.endsWith('.png'));
      const bestKey: string = pngKey ?? keys[0];
      const buffer: Buffer | null = await readBinaryS3(bestKey);
      if (buffer) {
        let source: LogoSource = 'unknown';
        if (bestKey.includes('_google')) source = 'google';
        else if (bestKey.includes('_clearbit')) source = 'clearbit';
        else if (bestKey.includes('_ddg')) source = 'duckduckgo';
        if (isDebug) console.log(`[DataAccess/Logos-S3] Found logo for ${domain} by S3 list pattern match: ${bestKey}`);
        return { buffer, source };
      }
    }
    
    // Fallback to old format (without hash) for backward compatibility
    const oldKeys: string[] = allKeys.filter(key => key.startsWith(`${LOGOS_S3_KEY_DIR}/${id}_`));
    if (oldKeys.length > 0) {
      // Filter out new format keys to avoid duplicates
      const legacyKeys = oldKeys.filter(key => !key.includes(`_${domainHash}_`));
      
      if (legacyKeys.length > 0) {
        const pngKey: string | undefined = legacyKeys.find(key => key.endsWith('.png'));
        const bestKey: string = pngKey ?? legacyKeys[0];
        const buffer: Buffer | null = await readBinaryS3(bestKey);
        if (buffer) {
          let source: LogoSource = 'unknown';
          if (bestKey.includes('_google')) source = 'google';
          else if (bestKey.includes('_clearbit')) source = 'clearbit';
          else if (bestKey.includes('_ddg')) source = 'duckduckgo';
          if (isDebug) console.log(`[DataAccess/Logos-S3] Found logo for ${domain} by S3 list pattern match (legacy): ${bestKey}`);
          return { buffer, source };
        }
      }
    }
    
  } catch (error) {
    console.warn(`[DataAccess/Logos-S3] Error listing or reading logos for domain ${domain}:`, error);
  }
  return null;
}
