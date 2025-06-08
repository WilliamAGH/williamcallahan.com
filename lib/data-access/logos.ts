/**
 * Logos Data Access Module
 *
 * Handles fetching, caching, processing, and serving of company logos.
 * Access pattern: In-memory Cache → S3 Storage → External APIs.
 *
 * @module data-access/logos
 */

import { ServerCacheInstance } from '@/lib/server-cache';
import type { LogoSource } from '@/types';
import { readBinaryS3, writeBinaryS3 } from '@/lib/s3-utils';
import { createHash } from 'node:crypto';
import { VERBOSE } from './logos/config';
import { addKeyToS3LogoCache, invalidateS3LogoKeysCache } from './logos/s3-cache';
import { findLogoInS3, getLogoS3Key } from './logos/s3-operations';
import { processImageBuffer } from './logos/image-processing';
import { fetchExternalLogo } from './logos/external-fetch';
import {
  checkAndResetSession,
  isDomainProcessed,
  markDomainAsProcessed,
  hasDomainFailedTooManyTimes,
  markDomainAsFailed,
  incrementDomainRetryCount,
  resetLogoSessionTracking,
  getLogoSessionStats,
} from './logos/session';

export { resetLogoSessionTracking, getLogoSessionStats };

/**
 * Exported function to invalidate S3 logo keys cache.
 * Useful for external scripts or when manual cache invalidation is needed.
 */
export function invalidateLogoS3Cache(): void {
  invalidateS3LogoKeysCache();
}

/**
 * Retrieves a company logo using cache, S3 storage, or external sources.
 *
 * Checks global override, in-memory cache, S3 storage, and finally external APIs if allowed.
 * Caches and uploads new or updated logos to S3 as needed.
 *
 * @param domain - The domain for which to retrieve the logo
 * @returns Promise with logo buffer, source, and content type, or null if not found
 * @remark External fetching can be skipped via environment variables and results are cached
 */
export async function getLogo(domain: string): Promise<{ buffer: Buffer; source: LogoSource; contentType: string } | null> {
  checkAndResetSession();

  if (isDomainProcessed(domain)) {
    if (VERBOSE) console.log(`[DataAccess/Logos] Domain ${domain} already processed in this session, skipping.`);
    const cached = ServerCacheInstance.getLogoFetch(domain);
    if (cached?.buffer) {
      const { processedBuffer, contentType } = await processImageBuffer(cached.buffer);
      return { buffer: processedBuffer, source: cached.source || 'unknown', contentType };
    }
    return null;
  }

  if (hasDomainFailedTooManyTimes(domain)) {
    if (VERBOSE) console.log(`[DataAccess/Logos] Domain ${domain} failed too many times in this session, skipping.`);
    return null;
  }

  // Skip global override check in production to avoid SSR issues
  if (process.env.NODE_ENV !== 'production') {
    const override: typeof getLogo | undefined = (globalThis as {getLogo?: typeof getLogo}).getLogo;
    if (typeof override === 'function' && override !== getLogo) {
      return override(domain);
    }
  }

  const cached: { url: string | null; source: LogoSource | null; buffer?: Buffer; error?: string } | undefined = ServerCacheInstance.getLogoFetch(domain);
  if (cached?.buffer) {
    console.log(`[DataAccess/Logos] Returning logo for ${domain} from cache (source: ${cached.source || 'unknown'}).`);
    markDomainAsProcessed(domain);
    const { processedBuffer, contentType } = await processImageBuffer(cached.buffer);
    return { buffer: processedBuffer, source: cached.source || 'unknown', contentType };
  }

  const force: boolean = process.env.FORCE_LOGOS === 'true';
  if (force) console.log(`[DataAccess/Logos] FORCE_LOGOS enabled, skipping S3 for ${domain}, forcing external fetch.`);
  
  let s3Logo: { buffer: Buffer; source: LogoSource } | null = null;
  if (!force) {
    s3Logo = await findLogoInS3(domain);
  }

  if (s3Logo) {
    const { processedBuffer, contentType: s3ContentType } = await processImageBuffer(s3Logo.buffer);
    ServerCacheInstance.setLogoFetch(domain, { url: null, source: s3Logo.source, buffer: processedBuffer });
    markDomainAsProcessed(domain);
    return { buffer: processedBuffer, source: s3Logo.source, contentType: s3ContentType };
  }

  const skipExternalLogoFetch: boolean = (process.env.NODE_ENV === 'test' && process.env.ALLOW_EXTERNAL_FETCH_IN_TEST !== 'true') || process.env.SKIP_EXTERNAL_LOGO_FETCH === 'true';
  if (skipExternalLogoFetch) {
    if (VERBOSE) console.log(`[DataAccess/Logos] Skipping external logo fetch for ${domain} (test or skip flag).`);
    ServerCacheInstance.setLogoFetch(domain, { url: null, source: null, error: 'External fetch skipped' });
    markDomainAsFailed(domain);
    return null;
  }

  if (cached?.error) {
    console.log(`[DataAccess/Logos] Previous error cached for ${domain}: ${cached.error}, skipping external fetch.`);
    markDomainAsFailed(domain);
    return null;
  }

  console.log(`[DataAccess/Logos] Logo for ${domain} not in cache or S3, fetching from external source.`);
  
  incrementDomainRetryCount(domain);
  
  const externalLogo = await fetchExternalLogo(domain);

  if (externalLogo) {
    const { processedBuffer, isSvg, contentType: externalContentType } = await processImageBuffer(externalLogo.buffer);
    const fileExt = isSvg ? 'svg' : 'png';
    const logoS3Key = getLogoS3Key(domain, externalLogo.source, fileExt);

    try {
      const existingBuffer = await readBinaryS3(logoS3Key);
      let didUpload = false;

      if (existingBuffer) {
        const existingHash = createHash('md5').update(existingBuffer).digest('hex');
        const newHash = createHash('md5').update(processedBuffer).digest('hex');

        if (existingHash !== newHash) {
          await writeBinaryS3(logoS3Key, processedBuffer, externalContentType);
          if (VERBOSE) console.log(`[DataAccess/Logos-S3] Logo for ${domain} changed; uploaded to ${logoS3Key}.`);
          didUpload = true;
          addKeyToS3LogoCache(logoS3Key);
        }
      } else {
        await writeBinaryS3(logoS3Key, processedBuffer, externalContentType);
        if (VERBOSE) console.log(`[DataAccess/Logos-S3] New logo for ${domain}; uploaded to ${logoS3Key}.`);
        didUpload = true;
        addKeyToS3LogoCache(logoS3Key);
      }
      if (VERBOSE && !didUpload) console.log(`[DataAccess/Logos-S3] No upload needed for ${domain}.`);
    } catch (uploadError: unknown) {
      console.error(`[DataAccess/Logos-S3] Error writing logo for ${domain} to S3:`, uploadError);
    }

    ServerCacheInstance.setLogoFetch(domain, { url: null, source: externalLogo.source, buffer: processedBuffer });
    markDomainAsProcessed(domain);
    return { buffer: processedBuffer, source: externalLogo.source, contentType: externalContentType };
  }

  console.log(`[DataAccess/Logos] No logo found for ${domain} from all sources.`);
  ServerCacheInstance.setLogoFetch(domain, { url: null, source: null, error: 'Failed to fetch logo' });
  markDomainAsFailed(domain);
  return null;
}

/**
 * Retrieves and processes a logo for the specified domain directly from S3 storage.
 *
 * @param domain - The domain for which to retrieve the logo
 * @returns Logo buffer, source, and content type if found in S3, null otherwise
 */
export async function serveLogoFromS3(domain: string): Promise<{ buffer: Buffer; source: LogoSource; contentType: string } | null> {
  const s3Logo = await findLogoInS3(domain);
  if (!s3Logo) return null;
  const { buffer, source } = s3Logo;
  const { processedBuffer, contentType } = await processImageBuffer(buffer);
  return { buffer: processedBuffer, source, contentType };
}
