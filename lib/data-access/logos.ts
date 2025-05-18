/**
 * Logos Data Access Module
 *
 * Handles fetching, caching, processing, and serving of company logos
 * Access pattern: In-memory Cache → S3 Storage → External APIs (Google, Clearbit, DuckDuckGo)
 * Includes image validation, format conversion, and size verification
 *
 * @module data-access/logos
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
 * Constructs the S3 object key for a company logo using the domain and logo source
 *
 * @param domain - The domain name associated with the logo
 * @param source - The logo source identifier
 * @param ext - The file extension for the logo (default: 'png')
 * @returns The S3 key string for storing or retrieving the logo
 */
function getLogoS3Key(domain: string, source: LogoSource, ext: 'png' | 'svg' = 'png'): string {
  const id = domain.split('.')[0];
  const sourceAbbr = source === 'duckduckgo' ? 'ddg' : source;
  return `${LOGOS_S3_KEY_DIR}/${id}_${sourceAbbr}.${ext}`;
}

/**
 * Searches for a logo associated with the given domain in S3 storage
 *
 * Checks known sources (Google, Clearbit, DuckDuckGo) and falls back to prefix matching
 *
 * @param domain - The domain to search for a logo
 * @returns Promise with logo buffer and source, or null if not found
 */
export async function findLogoInS3(domain: string): Promise<{ buffer: Buffer; source: LogoSource } | null> {
  for (const source of ['google', 'clearbit', 'duckduckgo'] as LogoSource[]) {
    // First try both PNG and SVG formats directly
    for (const ext of ['png', 'svg'] as const) {
      const logoS3Key = getLogoS3Key(domain, source, ext);
      try {
        const buffer = await readBinaryS3(logoS3Key);
        if (buffer) {
          console.log(`[DataAccess/Logos-S3] Found logo for ${domain} from source ${source} in S3 (key: ${logoS3Key}).`);
          return { buffer, source };
        }
      } catch (error) {
        if (VERBOSE) {
          console.warn(`[DataAccess/Logos-S3] Error reading ${logoS3Key} for domain ${domain} (source: ${source}):`, error instanceof Error ? error.message : String(error));
        }
        // Treat error as logo not found for this key, continue to next source
      }
    }
  }
  try {
    const id = domain.split('.')[0];
    const keys = await s3UtilsListS3Objects(`${LOGOS_S3_KEY_DIR}/${id}_`);
    if (keys.length === 0) {
      return null;
    }

    const pngMatch = keys.find(key => key.endsWith('.png'));
    const bestMatch = pngMatch || keys[0];

    try {
      const buffer = await readBinaryS3(bestMatch);
      if (!buffer) {
        return null;
      }

      let inferredSource: LogoSource = 'unknown';
      if (bestMatch.includes('_google')) inferredSource = 'google';
      else if (bestMatch.includes('_clearbit')) inferredSource = 'clearbit';
      else if (bestMatch.includes('_ddg')) inferredSource = 'duckduckgo';

      console.log(`[DataAccess/Logos-S3] Found logo for ${domain} by S3 list pattern match: ${bestMatch}`);
      return { buffer, source: inferredSource };
    } catch (error) {
      if (VERBOSE) {
        console.warn(`[DataAccess/Logos-S3] Error reading ${bestMatch} (found by list) for domain ${domain}:`, error instanceof Error ? error.message : String(error));
      }
      // Treat error as logo not found for this key
      return null;
    }
  } catch (listError: unknown) {
    const message = listError instanceof Error ? listError.message : String(listError);
    console.warn(`[DataAccess/Logos-S3] Error listing logos in S3 for domain ${domain} (prefix: ${LOGOS_S3_KEY_DIR}/${domain.split('.')[0]}_):`, message);
    return null;
  }
  return null;
}

/**
 * Determines whether an image buffer meets the minimum size requirements for logos
 *
 * SVG images are always considered large enough. Other formats must have width and height >= medium logo size
 *
 * @param buffer - The image buffer to evaluate
 * @returns Promise resolving to true if the image is sufficiently large, false otherwise
 */
async function isImageLargeEnough(buffer: Buffer): Promise<boolean> {
  try {
    const metadata = await sharp(buffer).metadata();
    if (metadata.format === 'svg') return true;
    return !!(metadata.width && metadata.height && metadata.width >= LOGO_SIZES.MD && metadata.height >= LOGO_SIZES.MD);
  } catch { return false; }
}

/**
 * Validates a logo image by checking for generic globe patterns and minimum size requirements
 *
 * @param buffer - The image buffer to validate
 * @param url - The source URL of the logo, used to detect generic globe images
 * @returns Promise resolving to true if valid and not a generic globe image, false otherwise
 */
async function validateLogoBuffer(buffer: Buffer, url: string): Promise<boolean> {
  if (GENERIC_GLOBE_PATTERNS.some(pattern => pattern.test(url))) return false;
  if (!await isImageLargeEnough(buffer)) return false;
  return true;
}

/**
 * Fetches a company logo from external providers (Google, Clearbit, DuckDuckGo)
 *
 * @param domain - The domain for which to retrieve the logo
 * @returns Promise with processed logo buffer and source, or null if no valid logo found
 * @remark Only returns logos passing validation checks with 5-second timeout per source
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
 * Processes an image buffer to determine if it is SVG or PNG, converting non-SVG images to PNG
 *
 * @param buffer - The image data to process
 * @returns Object with processed buffer, SVG flag, and appropriate content type
 * @remark If processing fails, returns original buffer as PNG for safety
 */
export async function processImageBuffer(buffer: Buffer): Promise<{
  processedBuffer: Buffer;
  isSvg: boolean;
  contentType: string
}> {
  // Prioritize a direct SVG string check
  const bufferString = buffer.toString('utf-8').trim();
  if (bufferString.startsWith('<svg') && bufferString.includes('</svg>')) {
    if (VERBOSE) console.log('[DataAccess/Logos] Detected SVG by string content (startsWith <svg).');
    return { processedBuffer: buffer, isSvg: true, contentType: 'image/svg+xml' };
  }

  try {
    const metadata = await sharp(buffer).metadata();
    const isSvgBySharp = metadata.format === 'svg';

    if (isSvgBySharp) {
      if (VERBOSE) console.log('[DataAccess/Logos] Detected SVG by sharp.metadata.');
      return { processedBuffer: buffer, isSvg: true, contentType: 'image/svg+xml' };
    }

    // If not SVG by sharp, process as non-SVG (convert to PNG)
    if (VERBOSE) console.log('[DataAccess/Logos] Not SVG by sharp, converting to PNG.');
    const processedBuffer = await sharp(buffer).png().toBuffer();
    return { processedBuffer, isSvg: false, contentType: 'image/png' };

  } catch (error: unknown) {
    console.warn(`[DataAccess/Logos] processImageBuffer error with sharp: ${String(error)}. Falling back.`);
    // Fallback: Re-check for SVG string content if sharp failed, as sharp might not support all SVGs
    if (bufferString.includes('<svg')) {
      if (VERBOSE) console.log('[DataAccess/Logos] Fallback: Detected SVG-like content after sharp error.');
      return { processedBuffer: buffer, isSvg: true, contentType: 'image/svg+xml' };
    }
    if (VERBOSE) console.log('[DataAccess/Logos] Fallback: Defaulting to PNG content type after sharp error and no SVG string match.');
    // If sharp fails and it's not detected as SVG by string, assume it's a raster and return original buffer as PNG (or attempt conversion if safe)
    // For safety, returning original buffer with PNG type if conversion also risky or failed.
    return { processedBuffer: buffer, isSvg: false, contentType: 'image/png' };
  }
}

/**
 * Retrieves a company logo using cache, S3 storage, or external sources
 *
 * Checks global override, in-memory cache, S3 storage, and finally external APIs if allowed
 * Caches and uploads new or updated logos to S3 as needed
 *
 * @param domain - The domain for which to retrieve the logo
 * @returns Promise with logo buffer, source, and content type, or null if not found
 * @remark External fetching can be skipped via environment variables and results are cached
 */
export async function getLogo(domain: string): Promise<{ buffer: Buffer; source: LogoSource; contentType: string } | null> {
  const override = (globalThis as {getLogo?: typeof getLogo}).getLogo;
  if (typeof override === 'function' && override !== getLogo) {
    return override(domain);
  }
  const cached = ServerCacheInstance.getLogoFetch(domain);
  if (cached?.buffer) {
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
    const { contentType: s3ContentType } = await processImageBuffer(s3Logo.buffer);
    return { ...s3Logo, contentType: s3ContentType };
  }
  const skipExternalLogoFetch = (process.env.NODE_ENV === 'test' && process.env.ALLOW_EXTERNAL_FETCH_IN_TEST !== 'true') || process.env.SKIP_EXTERNAL_LOGO_FETCH === 'true';
  if (skipExternalLogoFetch) {
    if (VERBOSE) console.log(`[DataAccess/Logos] Skipping external logo fetch for ${domain} (test or skip flag).`);
    ServerCacheInstance.setLogoFetch(domain, { url: null, source: null, error: 'External fetch skipped' });
    return null;
  }
  console.log(`[DataAccess/Logos] Logo for ${domain} not in cache or S3, fetching from external source.`);
  const externalLogo = await fetchExternalLogo(domain);
  if (externalLogo) {
    // Process the image buffer to determine if it's SVG and get the correct content type
    const { processedBuffer, isSvg, contentType: externalContentType } = await processImageBuffer(externalLogo.buffer);

    // Get the appropriate file extension based on the image type
    const fileExt = isSvg ? '.svg' : '.png';
    const logoS3Key = getLogoS3Key(domain, externalLogo.source, fileExt.split('.')[1] as 'png' | 'svg');

    try {
      const existingBuffer = await readBinaryS3(logoS3Key);
      let didUpload = false;

      if (existingBuffer) {
        const existingHash = createHash('md5').update(existingBuffer).digest('hex');
        const newHash = createHash('md5').update(processedBuffer).digest('hex');

        if (existingHash === newHash) {
          console.log(`[DataAccess/Logos-S3] Logo for ${domain} unchanged (hash=${newHash}); skipping upload.`);
        } else {
          await writeBinaryS3(logoS3Key, processedBuffer, externalContentType);
          console.log(`[DataAccess/Logos-S3] Logo for ${domain} changed (old=${existingHash}, new=${newHash}); uploaded to ${logoS3Key}.`);
          didUpload = true;
        }
      } else {
        await writeBinaryS3(logoS3Key, processedBuffer, externalContentType);
        const newHash = createHash('md5').update(processedBuffer).digest('hex');
        console.log(`[DataAccess/Logos-S3] New logo for ${domain}; uploaded to ${logoS3Key} (hash=${newHash}).`);
        didUpload = true;
      }
      if (VERBOSE && !didUpload) console.log(`[DataAccess/Logos-S3] VERBOSE: No upload needed for ${domain}.`);
    } catch (uploadError) {
      console.error(`[DataAccess/Logos-S3] Error writing logo for ${domain} to S3:`, uploadError);
    }
    // Cache the processed buffer
    ServerCacheInstance.setLogoFetch(domain, { url: null, source: externalLogo.source, buffer: processedBuffer });
    // Return the processed buffer and its content type
    return { buffer: processedBuffer, source: externalLogo.source, contentType: externalContentType };
  }
  console.warn(`[DataAccess/Logos] Failed to fetch logo for ${domain} from all sources.`);
  ServerCacheInstance.setLogoFetch(domain, { url: null, source: null, error: 'Failed to fetch logo' });
  return null;
}

/**
 * Retrieves and processes a logo for the specified domain directly from S3 storage
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
