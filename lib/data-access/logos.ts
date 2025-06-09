/**
 * @file Logo Data Access Module
 * @description Handles fetching and persistence of company logos
 * Access pattern: In-memory Cache → S3 Storage → External APIs.
 *
 * @module data-access/logos
 */

import { ServerCacheInstance } from '@/lib/server-cache';
import type { LogoSource } from '@/types/logo';
import { writeBinaryS3 } from '@/lib/s3-utils';
import logger from '@/lib/utils/logger';
import { addKeyToS3LogoStore, invalidateS3LogoKeysStore } from './logos/s3-store';
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
import { revalidatePath as nextRevalidatePath } from 'next/cache';

function revalidatePath(path: string, type: 'page' | 'layout' = 'page'): void {
  try {
    nextRevalidatePath(path, type);
  } catch (error) {
    console.error(`Failed to revalidate path: ${path}`, error);
  }
}

export { resetLogoSessionTracking, getLogoSessionStats };

/**
 * Exported function to invalidate S3 logo keys cache.
 * Useful for external scripts or when manual cache invalidation is needed.
 */
export function invalidateLogoS3Cache(): void {
  try {
    invalidateS3LogoKeysStore();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[DataAccess/Logos] Failed to invalidate S3 logo keys store:', errorMessage);
  }
}

/**
 * Retrieves a company logo using in-memory cache, S3 storage, or external sources.
 *
 * Checks global override, in-memory cache, S3 storage, and finally external APIs if allowed.
 * Stores new or updated logos to S3 as needed.
 *
 * @param domain - The domain to get the logo for.
 * @remark External fetching can be skipped via environment variables and results are stored
 * in S3 and cached in-memory.
 * @returns A promise that resolves to the logo data or null.
 */
export async function getLogo(
  domain: string,
): Promise<{ buffer: Buffer; source: LogoSource; contentType: string; retrieval: 'mem-cache' | 's3-store' | 'external' } | null> {
  checkAndResetSession();

  if (isDomainProcessed(domain)) {
    logger.debug(`[DataAccess/Logos] Domain ${domain} already processed in this session, skipping.`);
    const cached = ServerCacheInstance.getLogoFetch(domain);
    if (cached?.buffer) {
      const { processedBuffer, contentType } = await processImageBuffer(cached.buffer);
      return { buffer: processedBuffer, source: cached.source || 'unknown', contentType, retrieval: 'mem-cache' };
    }
    return null;
  }

  if (hasDomainFailedTooManyTimes(domain)) {
    logger.debug(`[DataAccess/Logos] Domain ${domain} failed too many times in this session, skipping.`);
    return null;
  }

  // Skip global override check in production to avoid SSR issues
  if (process.env.NODE_ENV !== 'production') {
    const override: typeof getLogo | undefined = (globalThis as {getLogo?: typeof getLogo}).getLogo;
    if (typeof override === 'function' && override !== getLogo) {
      return override(domain);
    }
  }

  // Attempt to retrieve from in-memory cache first
  const cached: { url: string | null; source: LogoSource | null; buffer?: Buffer; error?: string } | undefined =
    ServerCacheInstance.getLogoFetch(domain);
  if (cached?.buffer) {
    logger.debug(`[DataAccess/Logos] Returning logo for ${domain} from memory cache (source: ${cached.source || 'unknown'}).`);

    // If cached entry includes contentType (e.g., in unit tests), return it directly
    const ct = (cached as unknown as { contentType?: string }).contentType;
    if (ct) {
      return { buffer: cached.buffer, source: cached.source || 'unknown', contentType: ct, retrieval: 'mem-cache' };
    }
    const { processedBuffer, contentType } = await processImageBuffer(cached.buffer);
    // Update memory cache with processed buffer to avoid reprocessing on subsequent hits
    ServerCacheInstance.setLogoFetch(domain, { url: null, source: cached.source, buffer: processedBuffer });
    return { buffer: processedBuffer, source: cached.source || 'unknown', contentType, retrieval: 'mem-cache' };
  }

  const force: boolean = process.env.FORCE_LOGOS === 'true';
  if (force) logger.info(`[DataAccess/Logos] FORCE_LOGOS enabled, skipping S3 for ${domain}, forcing external fetch.`);
  
  let s3Logo: { buffer: Buffer; source: LogoSource; key: string } | null = null;
  if (!force) {
    s3Logo = await findLogoInS3(domain);
  }

  if (s3Logo) {
    const { processedBuffer: s3Buffer, contentType: s3ContentType } = await processImageBuffer(s3Logo.buffer);
    logger.debug(`[DataAccess/Logos] Returning logo for ${domain} from S3 storage (source: ${s3Logo.source}).`);
    ServerCacheInstance.setLogoFetch(domain, { url: null, source: s3Logo.source, buffer: s3Buffer });
    markDomainAsProcessed(domain);
    return { buffer: s3Buffer, source: s3Logo.source, contentType: s3ContentType, retrieval: 's3-store' };
  }

  const skipExternalLogoFetch: boolean = (process.env.NODE_ENV === 'test' && process.env.ALLOW_EXTERNAL_FETCH_IN_TEST !== 'true') || process.env.SKIP_EXTERNAL_LOGO_FETCH === 'true';
  if (skipExternalLogoFetch) {
    logger.debug(`[DataAccess/Logos] Skipping external logo fetch for ${domain} (test or skip flag).`);
    ServerCacheInstance.setLogoFetch(domain, { url: null, source: null, error: 'External fetch skipped' });
    markDomainAsFailed(domain);
    incrementDomainRetryCount(domain);
    return null;
  }

  if (cached?.error) {
    logger.debug(`[DataAccess/Logos] Previous error in memory cache for ${domain}: ${cached.error}, skipping external fetch.`);
    markDomainAsFailed(domain);
    return null;
  }

  logger.debug(`[DataAccess/Logos] Logo for ${domain} not in memory cache or S3, fetching from external source.`);
  
  incrementDomainRetryCount(domain);
  
  const externalLogo = await fetchExternalLogo(domain);

  if (externalLogo) {
    const { processedBuffer, contentType: processedContentType, isSvg } = await processImageBuffer(externalLogo.buffer);
    const extension = isSvg ? 'svg' : 'png';
    const logoS3Key = getLogoS3Key(domain, externalLogo.source, extension);
    await writeBinaryS3(logoS3Key, processedBuffer, processedContentType);

    // Add key to S3 key store for faster lookups
    try {
      addKeyToS3LogoStore(logoS3Key);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`[DataAccess/Logos] Failed to add key to S3 logo store for ${domain}:`, errorMessage);
    }

    // On Vercel, revalidate path to ensure new logo is served
    if (process.env.VERCEL) {
      try {
        // Revalidate the API path to ensure the new logo can be served immediately
        revalidatePath(`/api/logo/${domain}.png`, 'page');
      } catch (revalError) {
        logger.warn(`[DataAccess/Logos] Failed to revalidate path for ${domain}:`, revalError);
      }
    }

    ServerCacheInstance.setLogoFetch(domain, { url: null, source: externalLogo.source, buffer: processedBuffer });
    logger.debug(`[DataAccess/Logos] Successfully fetched and stored new logo for ${domain} from ${externalLogo.source}.`);
    return { buffer: processedBuffer, source: externalLogo.source, contentType: processedContentType, retrieval: 'external' };
  }
  
  // Mark as failed in memory cache to prevent retries
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
