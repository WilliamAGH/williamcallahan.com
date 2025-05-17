/**
 * Logos Data Access
 *
 * Handles fetching, caching, processing, and serving of company logos
 * Access pattern: In-memory Cache → S3 Storage → External APIs (Google, Clearbit, DuckDuckGo)
 */

import { ServerCacheInstance } from '@/lib/server-cache';
import type { LogoSource } from '@/types';
import { LOGO_SOURCES, GENERIC_GLOBE_PATTERNS, LOGO_SIZES } from '@/lib/constants';
import { readBinaryS3, writeBinaryS3, listS3Objects as s3UtilsListS3Objects } from '@/lib/s3-utils';
import sharp from 'sharp';
import { createHash } from 'node:crypto';

// --- Configuration & Constants ---
export const LOGOS_S3_KEY_DIR = 'images/logos';
const VERBOSE = process.env.VERBOSE === 'true' || false;

// --- Helper Functions ---

/**
 * Generates the S3 key for a logo based on its domain and source
 * @param domain - The domain for which the logo is requested
 * @param source - The source from which the logo was/will be fetched
 * @returns The S3 key string
 */
function getLogoS3Key(domain: string, source: LogoSource): string {
  const id = domain.split('.')[0];
  const sourceAbbr = source === 'duckduckgo' ? 'ddg' : source;
  return `${LOGOS_S3_KEY_DIR}/${id}_${sourceAbbr}.png`;
}

/**
 * Attempts to find a logo for a given domain in S3 by checking known sources or listing objects
 * @param domain - The domain for which to find the logo
 * @returns A promise that resolves to an object containing the logo buffer and its source, or null if not found
 */
export async function findLogoInS3(domain: string): Promise<{ buffer: Buffer; source: LogoSource } | null> {
  for (const source of ['google', 'clearbit', 'duckduckgo'] as LogoSource[]) {
    const logoS3Key = getLogoS3Key(domain, source);
    const buffer = await readBinaryS3(logoS3Key);
    if (buffer) {
      console.log(`[DataAccess/Logos-S3] Found logo for ${domain} from source ${source} in S3.`);
      return { buffer, source };
    }
  }
  try {
    const id = domain.split('.')[0];
    const keys = await s3UtilsListS3Objects(`${LOGOS_S3_KEY_DIR}/${id}_`);
    if (keys.length > 0) {
      const pngMatch = keys.find(key => key.endsWith('.png'));
      const bestMatch = pngMatch || keys[0];
      const buffer = await readBinaryS3(bestMatch);
      if (buffer) {
        let inferredSource: LogoSource = 'unknown';
        if (bestMatch.includes('_google')) inferredSource = 'google';
        else if (bestMatch.includes('_clearbit')) inferredSource = 'clearbit';
        else if (bestMatch.includes('_ddg')) inferredSource = 'duckduckgo';
        console.log(`[DataAccess/Logos-S3] Found logo for ${domain} by S3 list pattern match: ${bestMatch}`);
        return { buffer, source: inferredSource };
      }
    }
  } catch (listError: unknown) {
    const message = listError instanceof Error ? listError.message : String(listError);
    console.warn(`[DataAccess/Logos-S3] Error listing logos in S3 for domain ${domain} (prefix: ${LOGOS_S3_KEY_DIR}/${domain.split('.')[0]}_):`, message);
  }
  return null;
}

/**
 * Checks if an image buffer is large enough based on predefined dimensions
 * SVG images are always considered large enough
 * @param buffer - The image buffer to check
 * @returns A promise that resolves to true if the image is large enough, false otherwise
 */
async function isImageLargeEnough(buffer: Buffer): Promise<boolean> {
  try {
    const metadata = await sharp(buffer).metadata();
    if (metadata.format === 'svg') return true;
    return !!(metadata.width && metadata.height && metadata.width >= LOGO_SIZES.MD && metadata.height >= LOGO_SIZES.MD);
  } catch { return false; }
}

/**
 * Validates a logo buffer against generic patterns and size requirements
 * @param buffer - The image buffer to validate
 * @param url - The URL from which the logo was fetched (used for generic pattern matching)
 * @returns A promise that resolves to true if the buffer is valid, false otherwise
 */
async function validateLogoBuffer(buffer: Buffer, url: string): Promise<boolean> {
  if (GENERIC_GLOBE_PATTERNS.some(pattern => pattern.test(url))) return false;
  if (!await isImageLargeEnough(buffer)) return false;
  return true;
}

/**
 * Fetches a logo for a given domain from external sources (Google, Clearbit, DuckDuckGo)
 * Tries multiple sources and resolutions
 * @param domain - The domain for which to fetch the logo
 * @returns A promise that resolves to an object containing the logo buffer and its source, or null if not found
 */
async function fetchExternalLogo(domain: string): Promise<{ buffer: Buffer; source: LogoSource } | null> {
  const sources: { name: LogoSource; urlFn: (domain: string) => string }[] = [
    { name: 'google', urlFn: LOGO_SOURCES.google.hd },
    { name: 'clearbit', urlFn: LOGO_SOURCES.clearbit.hd },
    { name: 'google', urlFn: LOGO_SOURCES.google.md },
    { name: 'clearbit', urlFn: LOGO_SOURCES.clearbit.md },
    { name: 'duckduckgo', urlFn: LOGO_SOURCES.duckduckgo.hd },
  ];
  for (const { name, urlFn } of sources) {
    const url = urlFn(domain);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      let response: Response;
      try {
        response = await fetch(url, { signal: controller.signal, headers: {'User-Agent': 'Mozilla/5.0'} });
      } finally {
        clearTimeout(timeoutId);
      }
      if (!response.ok) continue;
      const rawBuffer = Buffer.from(await response.arrayBuffer());
      if (!rawBuffer || rawBuffer.byteLength < 100) continue;
      if (await validateLogoBuffer(rawBuffer, url)) {

        const { processedBuffer } = await processImageBuffer(rawBuffer);
        console.log(`[DataAccess/Logos] Fetched logo for ${domain} from ${name}.`);
        return { buffer: processedBuffer, source: name };
      }
    } catch (error: unknown) {
      if ((error as Error).name !== 'AbortError') {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[DataAccess/Logos] Error fetching logo for ${domain} from ${name} (${url}):`, message);
      }
    }
  }
  return null;
}

/**
 * Processes an image buffer to determine its format (SVG or PNG) and content type
 * Converts non-SVG images to PNG
 * @param buffer - The raw image buffer
 * @returns A promise that resolves to an object containing the processed buffer, a flag indicating if it's SVG, and the content type
 */
export async function processImageBuffer(buffer: Buffer): Promise<{
  processedBuffer: Buffer;
  isSvg: boolean;
  contentType: string
}> {
  try {
    const metadata = await sharp(buffer).metadata();
    const isSvg = metadata.format === 'svg';
    const contentType = isSvg ? 'image/svg+xml' : 'image/png';
    const processedBuffer = isSvg ? buffer : await sharp(buffer).png().toBuffer();
    return { processedBuffer, isSvg, contentType };
  } catch (error: unknown) {
    console.warn(`[DataAccess/Logos] processImageBuffer fallback for buffer: ${String(error)}`);
    return { processedBuffer: buffer, isSvg: false, contentType: 'image/png' }; // Fallback for safety
  }
}

/**
 * Retrieves a logo for a given domain
 * Follows a cache → S3 → external fetch hierarchy
 * Handles caching, S3 storage, and external fetching logic
 * @param domain - The domain for which to get the logo
 * @returns A promise that resolves to an object containing the logo buffer, its source, and content type, or null if not found
 */
export async function getLogo(domain: string): Promise<{ buffer: Buffer; source: LogoSource; contentType: string } | null> {
  const override = (globalThis as {getLogo?: typeof getLogo}).getLogo;
  if (typeof override === 'function' && override !== getLogo) {
    return override(domain);
  }
  const cached = ServerCacheInstance.getLogoFetch(domain);
  if (cached && cached.buffer) {
    console.log(`[DataAccess/Logos] Returning logo for ${domain} from cache (source: ${cached.source || 'unknown'}).`);
    const { contentType } = await processImageBuffer(cached.buffer);
    return { buffer: cached.buffer, source: cached.source || 'unknown', contentType };
  }
  const force = process.env.FORCE_LOGOS === 'true';
  if (force) console.log(`[DataAccess/Logos] FORCE_LOGOS enabled, skipping S3 for ${domain}, forcing external fetch.`);
  let s3Logo: { buffer: Buffer; source: LogoSource } | null = null;
  if (!force) {
    s3Logo = await findLogoInS3(domain);
  }
  if (s3Logo) {
    ServerCacheInstance.setLogoFetch(domain, { url: null, source: s3Logo.source, buffer: s3Logo.buffer });
    const { contentType } = await processImageBuffer(s3Logo.buffer);
    return { ...s3Logo, contentType };
  }
  const skipExternalLogoFetch = process.env.NODE_ENV === 'test' || process.env.SKIP_EXTERNAL_LOGO_FETCH === 'true';
  if (skipExternalLogoFetch) {
    if (VERBOSE) console.log(`[DataAccess/Logos] Skipping external logo fetch for ${domain} (test or skip flag).`);
    ServerCacheInstance.setLogoFetch(domain, { url: null, source: null, error: 'External fetch skipped' });
    return null;
  }
  console.log(`[DataAccess/Logos] Logo for ${domain} not in cache or S3, fetching from external source.`);
  const externalLogo = await fetchExternalLogo(domain);
  if (externalLogo) {
    const logoS3Key = getLogoS3Key(domain, externalLogo.source);
    try {
      const existingBuffer = await readBinaryS3(logoS3Key);
      let didUpload = false;
      if (existingBuffer) {
        const existingHash = createHash('md5').update(existingBuffer).digest('hex');
        const newHash = createHash('md5').update(externalLogo.buffer).digest('hex');
        if (existingHash === newHash) {
          console.log(`[DataAccess/Logos-S3] Logo for ${domain} unchanged (hash=${newHash}); skipping upload.`);
        } else {
          await writeBinaryS3(logoS3Key, externalLogo.buffer, 'image/png'); // Assuming PNG after processing
          console.log(`[DataAccess/Logos-S3] Logo for ${domain} changed (old=${existingHash}, new=${newHash}); uploaded to ${logoS3Key}.`);
          didUpload = true;
        }
      } else {
        await writeBinaryS3(logoS3Key, externalLogo.buffer, 'image/png'); // Assuming PNG after processing
        const newHash = createHash('md5').update(externalLogo.buffer).digest('hex');
        console.log(`[DataAccess/Logos-S3] New logo for ${domain}; uploaded to ${logoS3Key} (hash=${newHash}).`);
        didUpload = true;
      }
      if (VERBOSE && !didUpload) console.log(`[DataAccess/Logos-S3] VERBOSE: No upload needed for ${domain}.`);
    } catch (uploadError) {
      console.error(`[DataAccess/Logos-S3] Error writing logo for ${domain} to S3:`, uploadError);
    }
    ServerCacheInstance.setLogoFetch(domain, { url: null, source: externalLogo.source, buffer: externalLogo.buffer });
    const { contentType } = await processImageBuffer(externalLogo.buffer);
    return { ...externalLogo, contentType };
  }
  console.warn(`[DataAccess/Logos] Failed to fetch logo for ${domain} from all sources.`);
  ServerCacheInstance.setLogoFetch(domain, { url: null, source: null, error: 'Failed to fetch logo' });
  return null;
}

/**
 * Serves a logo directly from S3 without external fetching or extensive caching logic
 * Primarily used by API routes that need to serve an already stored logo
 * @param domain - The domain for which to serve the logo
 * @returns A promise that resolves to an object containing the logo buffer, its source, and content type, or null if not found in S3
 */
export async function serveLogoFromS3(domain: string): Promise<{ buffer: Buffer; source: LogoSource; contentType: string } | null> {
  const s3Logo = await findLogoInS3(domain);
  if (!s3Logo) return null;
  const { buffer, source } = s3Logo;
  const { processedBuffer, contentType } = await processImageBuffer(buffer);
  return { buffer: processedBuffer, source, contentType };
}
