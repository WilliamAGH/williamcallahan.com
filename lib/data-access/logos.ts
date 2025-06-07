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

// Cache S3 logo keys to avoid repeated listing calls
let ALL_S3_LOGO_KEYS: string[] | null = null;
async function listAllS3LogoKeys(): Promise<string[]> {
  if (ALL_S3_LOGO_KEYS === null) {
    ALL_S3_LOGO_KEYS = await s3UtilsListS3Objects(`${LOGOS_S3_KEY_DIR}/`);
  }
  return ALL_S3_LOGO_KEYS;
}

// Session-based tracking to prevent infinite loops
const SESSION_PROCESSED_DOMAINS = new Set<string>();
const SESSION_FAILED_DOMAINS = new Set<string>();
let SESSION_START_TIME = Date.now();
const SESSION_MAX_DURATION = 30 * 60 * 1000; // 30 minutes
const MAX_RETRIES_PER_SESSION = 2;
const DOMAIN_RETRY_COUNT = new Map<string, number>();

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
  // Use a hash of the full domain to prevent collisions while keeping keys readable
  const domainHash = createHash('md5').update(domain).digest('hex').substring(0, 8);
  const id: string = domain.split('.')[0];
  const sourceAbbr: string = source === 'duckduckgo' ? 'ddg' : (source ?? 'unknown');
  return `${LOGOS_S3_KEY_DIR}/${id}_${domainHash}_${sourceAbbr}.${ext}`;
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
        console.log(`[DataAccess/Logos-S3] Found logo for ${domain} by S3 list pattern match: ${bestKey}`);
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
          console.log(`[DataAccess/Logos-S3] Found logo for ${domain} by S3 list pattern match (legacy): ${bestKey}`);
          return { buffer, source };
        }
      }
    }
  } catch (error) {
    console.warn(`[DataAccess/Logos-S3] Error listing or reading logos for domain ${domain}:`, error);
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
    const metadata: sharp.Metadata = await sharp(buffer).metadata();
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
  if (GENERIC_GLOBE_PATTERNS.some((pattern: RegExp) => pattern.test(url))) return false;
  if (!await isImageLargeEnough(buffer)) return false;
  return true;
}

/**
 * Gets browser-like headers to avoid bot detection
 */
function getBrowserHeaders(): Record<string, string> {
  const userAgents: string[] = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
  ];
  
  return {
    'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
    'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': 'https://www.google.com/',
    'Sec-Fetch-Dest': 'image',
    'Sec-Fetch-Mode': 'no-cors',
    'Sec-Fetch-Site': 'cross-site'
  };
}

/**
 * Extracts favicon from HTML content
 */
async function extractFaviconFromHtml(domain: string): Promise<{ buffer: Buffer; source: LogoSource } | null> {
  try {
    const controller: AbortController = new AbortController();
    const timeoutId: NodeJS.Timeout = setTimeout(() => controller.abort(), 5000);
    let response: Response;
    try {
      response = await fetch(`https://${domain}`, {
        signal: controller.signal,
        headers: getBrowserHeaders()
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) return null;
    const html: string = await response.text();

    // Look for favicon links in order of preference
    const faviconPatterns: RegExp[] = [
      /<link[^>]+rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]+href=["']([^"']+)["']/gi,
      /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:icon|shortcut icon|apple-touch-icon)["']/gi
    ];

    for (const pattern of faviconPatterns) {
      let match: RegExpExecArray | null;
      // biome-ignore lint/suspicious/noAssignInExpressions: Need to iterate through regex matches
      while ((match = pattern.exec(html)) !== null) {
        let faviconUrl: string | undefined = match[1];

        if (!faviconUrl) continue;

        // Handle relative URLs
        if (faviconUrl.startsWith('//')) {
          faviconUrl = `https:${faviconUrl}`;
        } else if (faviconUrl.startsWith('/')) {
          faviconUrl = `https://${domain}${faviconUrl}`;
        } else if (!faviconUrl.startsWith('http')) {
          faviconUrl = `https://${domain}/${faviconUrl}`;
        }

        // Try to fetch the favicon
        try {
          const faviconController: AbortController = new AbortController();
          const faviconTimeoutId: NodeJS.Timeout = setTimeout(() => faviconController.abort(), 3000);
          let faviconResponse: Response;
          try {
            faviconResponse = await fetch(faviconUrl, {
              signal: faviconController.signal,
              headers: getBrowserHeaders()
            });
          } finally {
            clearTimeout(faviconTimeoutId);
          }

          if (faviconResponse.ok) {
            const buffer: Buffer = Buffer.from(await faviconResponse.arrayBuffer());
            if (buffer.byteLength > 100 && await validateLogoBuffer(buffer, faviconUrl)) {
              console.log(`[DataAccess/Logos] Extracted favicon for ${domain} from HTML.`);
              return { buffer, source: 'unknown' };
            }
          }
        } catch {
          // Continue to next favicon candidate
        }
      }
    }

    // Try default favicon.ico as last resort
    try {
      const faviconController: AbortController = new AbortController();
      const faviconTimeoutId: NodeJS.Timeout = setTimeout(() => faviconController.abort(), 3000);
      let faviconResponse: Response;
      try {
        faviconResponse = await fetch(`https://${domain}/favicon.ico`, {
          signal: faviconController.signal,
          headers: getBrowserHeaders()
        });
      } finally {
        clearTimeout(faviconTimeoutId);
      }

      if (faviconResponse.ok) {
        const buffer: Buffer = Buffer.from(await faviconResponse.arrayBuffer());
        if (buffer.byteLength > 100 && await validateLogoBuffer(buffer, `https://${domain}/favicon.ico`)) {
          console.log(`[DataAccess/Logos] Found default favicon.ico for ${domain}.`);
          return { buffer, source: 'unknown' };
        }
      }
    } catch {
      // Favicon.ico not found
    }

  } catch (error) {
    if (VERBOSE) console.log(`[DataAccess/Logos] Error extracting favicon from HTML for ${domain}:`, error);
  }

  return null;
}

/**
 * Gets domain variants to try (subdomain and root domain)
 */
function getDomainVariants(domain: string): string[] {
  const variants: string[] = [domain];

  // If it's a subdomain, also try the root domain
  const parts: string[] = domain.split('.');
  if (parts.length > 2) {
    const rootDomain: string = parts.slice(-2).join('.');
    if (rootDomain !== domain) {
      variants.push(rootDomain);
    }
  }

  return variants;
}

/**
 * Fetches a company logo from external providers (Google, Clearbit, DuckDuckGo)
 *
 * @param domain - The domain for which to retrieve the logo
 * @returns Promise with processed logo buffer and source, or null if no valid logo found
 * @remark Only returns logos passing validation checks with 5-second timeout per source
 */
async function fetchExternalLogo(domain: string): Promise<{ buffer: Buffer; source: LogoSource } | null> {
  const domainVariants: string[] = getDomainVariants(domain);

  for (const testDomain of domainVariants) {
    const sources: { name: LogoSource; urlFn: (d: string) => string }[] = [
      { name: 'google', urlFn: LOGO_SOURCES.google.hd },
      { name: 'google', urlFn: LOGO_SOURCES.google.md },
      { name: 'duckduckgo', urlFn: LOGO_SOURCES.duckduckgo.hd },
      // Note: Clearbit removed due to authentication requirements
    ];

    for (const { name, urlFn } of sources) {
      const url: string = urlFn(testDomain);
      try {
        console.log(`[DEBUG] Attempting ${name} fetch: ${url}`);
        
        const controller: AbortController = new AbortController();
        const timeoutId: NodeJS.Timeout = setTimeout(() => controller.abort(), 5000);
        let response: Response;
        try {
          response = await fetch(url, {
            signal: controller.signal,
            headers: getBrowserHeaders()
          });
        } finally {
          clearTimeout(timeoutId);
        }
        
        console.log(`[DEBUG] ${name} response status: ${response.status} for ${url}`);
        if (!response.ok) continue;

        // Standard handling for other sources
        const rawBuffer: Buffer = Buffer.from(await response.arrayBuffer());
        if (!rawBuffer || rawBuffer.byteLength < 100) continue;
        if (await validateLogoBuffer(rawBuffer, url)) {
          const { processedBuffer } = await processImageBuffer(rawBuffer);
          console.log(`[DataAccess/Logos] Fetched logo for ${domain} from ${name} (using ${testDomain}).`);
          return { buffer: processedBuffer, source: name };
        }
      } catch (error: unknown) {
        if ((error as Error).name !== 'AbortError') {
          const message: string = error instanceof Error ? error.message : String(error);
          console.warn(`[DataAccess/Logos] Error fetching logo for ${testDomain} from ${name} (${url}):`, message);
        }
      }
    }
  }

  // If all API sources fail, try HTML favicon extraction on original domain
  const htmlFavicon: { buffer: Buffer; source: LogoSource } | null = await extractFaviconFromHtml(domain);
  if (htmlFavicon) {
    const { processedBuffer } = await processImageBuffer(htmlFavicon.buffer);
    return { buffer: processedBuffer, source: htmlFavicon.source };
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
  contentType: string;
}> {
  // Prioritize a direct SVG string check
  const bufferString: string = buffer.toString('utf-8').trim();
  if (bufferString.startsWith('<svg') && bufferString.includes('</svg>')) {
    if (VERBOSE) console.log('[DataAccess/Logos] Detected SVG by string content (startsWith <svg).');
    return { processedBuffer: buffer, isSvg: true, contentType: 'image/svg+xml' };
  }

  try {
    const metadata: sharp.Metadata = await sharp(buffer).metadata();
    const isSvgBySharp: boolean = metadata.format === 'svg';

    if (isSvgBySharp) {
      if (VERBOSE) console.log('[DataAccess/Logos] Detected SVG by sharp.metadata.');
      return { processedBuffer: buffer, isSvg: true, contentType: 'image/svg+xml' };
    }

    // If not SVG by sharp, process as non-SVG (convert to PNG)
    if (VERBOSE) console.log('[DataAccess/Logos] Not SVG by sharp, converting to PNG.');
    const processedBuffer: Buffer = await sharp(buffer).png().toBuffer();
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
  // Check session limits to prevent infinite loops
  const currentTime: number = Date.now();
  if (currentTime - SESSION_START_TIME > SESSION_MAX_DURATION) {
    if (VERBOSE) console.log(`[DataAccess/Logos] Session expired for ${domain}, resetting tracking.`);
    SESSION_PROCESSED_DOMAINS.clear();
    SESSION_FAILED_DOMAINS.clear();
    DOMAIN_RETRY_COUNT.clear();
    SESSION_START_TIME = Date.now();
  }

  // Skip if already processed successfully in this session
  if (SESSION_PROCESSED_DOMAINS.has(domain)) {
    if (VERBOSE) console.log(`[DataAccess/Logos] Domain ${domain} already processed in this session, skipping.`);
    const cached = ServerCacheInstance.getLogoFetch(domain);
    if (cached?.buffer) {
      const { processedBuffer, contentType } = await processImageBuffer(cached.buffer);
      return { buffer: processedBuffer, source: cached.source || 'unknown', contentType };
    }
    return null;
  }

  // Skip if failed too many times in this session
  if (SESSION_FAILED_DOMAINS.has(domain)) {
    const retryCount: number = DOMAIN_RETRY_COUNT.get(domain) || 0;
    if (retryCount >= MAX_RETRIES_PER_SESSION) {
      if (VERBOSE) console.log(`[DataAccess/Logos] Domain ${domain} failed ${retryCount} times in this session, skipping.`);
      return null;
    }
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
    SESSION_PROCESSED_DOMAINS.add(domain);
    const { contentType }: { processedBuffer: Buffer; isSvg: boolean; contentType: string } = await processImageBuffer(cached.buffer);
    return { buffer: cached.buffer, source: cached.source || 'unknown', contentType };
  }
  const force: boolean = process.env.FORCE_LOGOS === 'true';
  if (force) console.log(`[DataAccess/Logos] FORCE_LOGOS enabled, skipping S3 for ${domain}, forcing external fetch.`);
  let s3Logo: { buffer: Buffer; source: LogoSource } | null = null;
  if (!force) {
    s3Logo = await findLogoInS3(domain);
  }
  if (s3Logo) {
    // Process and cache normalized buffer
    const { processedBuffer, contentType: s3ContentType } = await processImageBuffer(s3Logo.buffer);
    ServerCacheInstance.setLogoFetch(domain, { url: null, source: s3Logo.source, buffer: processedBuffer });
    SESSION_PROCESSED_DOMAINS.add(domain);
    return { buffer: processedBuffer, source: s3Logo.source, contentType: s3ContentType };
  }
  const skipExternalLogoFetch: boolean = (process.env.NODE_ENV === 'test' && process.env.ALLOW_EXTERNAL_FETCH_IN_TEST !== 'true') || process.env.SKIP_EXTERNAL_LOGO_FETCH === 'true';
  if (skipExternalLogoFetch) {
    if (VERBOSE) console.log(`[DataAccess/Logos] Skipping external logo fetch for ${domain} (test or skip flag).`);
    ServerCacheInstance.setLogoFetch(domain, { url: null, source: null, error: 'External fetch skipped' });
    SESSION_FAILED_DOMAINS.add(domain);
    return null;
  }
  // Skip repeated external fetches for domains that previously failed
  if (cached?.error) {
    console.log(`[DataAccess/Logos] Previous error cached for ${domain}: ${cached.error}, skipping external fetch.`);
    SESSION_FAILED_DOMAINS.add(domain);
    return null;
  }

  console.log(`[DataAccess/Logos] Logo for ${domain} not in cache or S3, fetching from external source.`);
  
  // Track retry attempts
  const currentRetries: number = DOMAIN_RETRY_COUNT.get(domain) || 0;
  DOMAIN_RETRY_COUNT.set(domain, currentRetries + 1);
  
  const externalLogo: { buffer: Buffer; source: LogoSource } | null = await fetchExternalLogo(domain);
  if (externalLogo) {
    // Process the image buffer to determine if it's SVG and get the correct content type
    const { processedBuffer, isSvg, contentType: externalContentType }: { processedBuffer: Buffer; isSvg: boolean; contentType: string } = await processImageBuffer(externalLogo.buffer);

    // Get the appropriate file extension based on the image type
    const fileExt: string = isSvg ? '.svg' : '.png';
    const logoS3Key: string = getLogoS3Key(domain, externalLogo.source, fileExt.split('.')[1] as 'png' | 'svg');

    try {
      const existingBuffer: Buffer | null = await readBinaryS3(logoS3Key);
      let didUpload = false;

      if (existingBuffer) {
        const existingHash: string = createHash('md5').update(existingBuffer).digest('hex');
        const newHash: string = createHash('md5').update(processedBuffer).digest('hex');

        if (existingHash === newHash) {
          console.log(`[DataAccess/Logos-S3] Logo for ${domain} unchanged (hash=${newHash}); skipping upload.`);
        } else {
          await writeBinaryS3(logoS3Key, processedBuffer, externalContentType);
          console.log(`[DataAccess/Logos-S3] Logo for ${domain} changed (old=${existingHash}, new=${newHash}); uploaded to ${logoS3Key}.`);
          didUpload = true;
        }
      } else {
        await writeBinaryS3(logoS3Key, processedBuffer, externalContentType);
        const newHash: string = createHash('md5').update(processedBuffer).digest('hex');
        console.log(`[DataAccess/Logos-S3] New logo for ${domain}; uploaded to ${logoS3Key} (hash=${newHash}).`);
        didUpload = true;
      }
      if (VERBOSE && !didUpload) console.log(`[DataAccess/Logos-S3] VERBOSE: No upload needed for ${domain}.`);
    } catch (uploadError: unknown) {
      console.error(`[DataAccess/Logos-S3] Error writing logo for ${domain} to S3:`, uploadError);
    }
    // Cache the processed buffer and mark as successfully processed
    ServerCacheInstance.setLogoFetch(domain, { url: null, source: externalLogo.source, buffer: processedBuffer });
    SESSION_PROCESSED_DOMAINS.add(domain);
    // Return the processed buffer and its content type
    return { buffer: processedBuffer, source: externalLogo.source, contentType: externalContentType };
  }
  console.log(`[DataAccess/Logos] No logo found for ${domain} from all sources.`);
  ServerCacheInstance.setLogoFetch(domain, { url: null, source: null, error: 'Failed to fetch logo' });
  SESSION_FAILED_DOMAINS.add(domain);
  return null;
}

/**
 * Retrieves and processes a logo for the specified domain directly from S3 storage
 *
 * @param domain - The domain for which to retrieve the logo
 * @returns Logo buffer, source, and content type if found in S3, null otherwise
 */
export async function serveLogoFromS3(domain: string): Promise<{ buffer: Buffer; source: LogoSource; contentType: string } | null> {
  const s3Logo: { buffer: Buffer; source: LogoSource } | null = await findLogoInS3(domain);
  if (!s3Logo) return null;
  const { buffer, source }: { buffer: Buffer; source: LogoSource } = s3Logo;
  const { processedBuffer, contentType }: { processedBuffer: Buffer; isSvg: boolean; contentType: string } = await processImageBuffer(buffer);
  return { buffer: processedBuffer, source, contentType };
}

/**
 * Resets the session tracking state to prevent infinite loops
 * Useful for clearing state between different processing contexts
 */
export function resetLogoSessionTracking(): void {
  SESSION_PROCESSED_DOMAINS.clear();
  SESSION_FAILED_DOMAINS.clear();
  DOMAIN_RETRY_COUNT.clear();
  SESSION_START_TIME = Date.now();
  console.log('[DataAccess/Logos] Session tracking reset.');
}

/**
 * Gets current session tracking statistics for debugging
 */
export function getLogoSessionStats(): {
  processedCount: number;
  failedCount: number;
  sessionAge: number;
} {
  return {
    processedCount: SESSION_PROCESSED_DOMAINS.size,
    failedCount: SESSION_FAILED_DOMAINS.size,
    sessionAge: Date.now() - SESSION_START_TIME,
  };
}
