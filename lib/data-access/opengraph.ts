/**
 * OpenGraph Data Access Module
 *
 * Handles fetching, caching, and serving of OpenGraph metadata
 * Access pattern: In-memory Cache → S3 Storage → External APIs
 * Provides resilient OpenGraph data retrieval with comprehensive error handling
 *
 * @module data-access/opengraph
 */

import { ServerCacheInstance } from '@/lib/server-cache';
import { readJsonS3, writeJsonS3 } from '@/lib/s3-utils';
import { OPENGRAPH_CACHE_DURATION, OPENGRAPH_FETCH_CONFIG } from '@/lib/constants';
import {
  validateOgUrl,
  normalizeUrl,
  hashUrl,
  sanitizeOgMetadata,
  getDomainType,
  shouldRetryUrl,
  calculateBackoffDelay,
  isValidImageUrl,
  getImageExtension,
  hashImageContent
} from '@/lib/utils/opengraph-utils';
import type { OgResult } from '@/types';
import * as cheerio from 'cheerio';
import { waitForPermit, OPENGRAPH_FETCH_STORE_NAME, OPENGRAPH_FETCH_CONTEXT_ID, DEFAULT_OPENGRAPH_FETCH_LIMIT_CONFIG } from '@/lib/rate-limiter';
import { debug, debugWarn } from '@/lib/utils/debug';

// --- Configuration & Constants ---
export const OPENGRAPH_S3_KEY_DIR = 'opengraph';
export const OPENGRAPH_METADATA_S3_DIR = `${OPENGRAPH_S3_KEY_DIR}/metadata`;
export const OPENGRAPH_IMAGES_S3_DIR = `${OPENGRAPH_S3_KEY_DIR}/images`;

// --- Circuit Breaker & Session Management ---
const SESSION_FAILURE_TTL = 30 * 60 * 1000; // 30 minutes
const SESSION_FAILED_DOMAINS = new Map<string, number>(); // Store domain -> timestamp

/**
 * Adds a domain to the failed list and cleans up old entries.
 * @param domain The domain that failed.
 */
function addFailedDomain(domain: string): void {
  const now = Date.now();
  SESSION_FAILED_DOMAINS.set(domain, now);
  // Clean up old entries
  for (const [d, timestamp] of SESSION_FAILED_DOMAINS.entries()) {
    if (now - timestamp > SESSION_FAILURE_TTL) {
      SESSION_FAILED_DOMAINS.delete(d);
    }
  }
}

/**
 * Checks if a domain is currently in the failed list (and not expired).
 * @param domain The domain to check.
 * @returns True if the domain is considered failed, false otherwise.
 */
function isFailedDomain(domain: string): boolean {
  const timestamp = SESSION_FAILED_DOMAINS.get(domain);
  if (!timestamp) return false;

  if (Date.now() - timestamp > SESSION_FAILURE_TTL) {
    SESSION_FAILED_DOMAINS.delete(domain); // Expired, remove it
    return false;
  }
  return true; // Still within TTL
}

const inFlightOgPromises: Map<string, Promise<OgResult | null>> = new Map();

// Insert env-based fallback mapping above getFallbackImageForDomain
const FALLBACK_IMAGES: Record<string, string> = {
  GitHub: process.env.FALLBACK_IMAGE_GITHUB || 'https://avatars.githubusercontent.com/u/99231285?v=4',
  X: process.env.FALLBACK_IMAGE_X || 'https://pbs.twimg.com/profile_images/1515007138717503494/KUQNKo_M_400x400.jpg',
  Twitter: process.env.FALLBACK_IMAGE_TWITTER || 'https://pbs.twimg.com/profile_images/1515007138717503494/KUQNKo_M_400x400.jpg',
  LinkedIn: process.env.FALLBACK_IMAGE_LINKEDIN || 'https://media.licdn.com/dms/image/C5603AQGjv8C3WhrUfQ/profile-displayphoto-shrink_800_800/0/1651775977276',
  Discord: process.env.FALLBACK_IMAGE_DISCORD || '/images/william.jpeg',
  Bluesky: process.env.FALLBACK_IMAGE_BLUESKY || 'https://cdn.bsky.app/img/avatar/plain/did:plc:o3rar2atqxlmczkaf6npbcqz/bafkreidpq75jyggvzlm5ddgpzhfkm4vprgitpxukqpgkrwr6sqx54b2oka@jpeg',
  default: process.env.FALLBACK_IMAGE_DEFAULT || '/images/william.jpeg'
};

/**
 * Retrieves OpenGraph data using a hierarchical strategy: memory cache, S3 storage, and external fetch as fallback
 *
 * @param url - URL to fetch OpenGraph data for
 * @param skipExternalFetch - If true, bypasses external fetch and relies on cache/S3
 * @returns Promise resolving to OpenGraph result
 */
export async function getOpenGraphData(url: string, skipExternalFetch = false): Promise<OgResult> {
  const normalizedUrl = normalizeUrl(url);
  const urlHash = hashUrl(normalizedUrl);
  
  debug(`[DataAccess/OpenGraph] Fetching OG data for: ${normalizedUrl}`);

  // Validate URL first
  if (!validateOgUrl(normalizedUrl)) {
    console.warn(`[DataAccess/OpenGraph] Invalid or unsafe URL: ${normalizedUrl}`);
    return createFallbackResult(normalizedUrl, 'Invalid or unsafe URL');
  }

  // Check memory cache first
  const cached = ServerCacheInstance.getOpenGraphData(normalizedUrl);
  const shouldRefresh = ServerCacheInstance.shouldRefreshOpenGraph(normalizedUrl);

  if (cached && !shouldRefresh) {
    debug(`[DataAccess/OpenGraph] Returning fresh cached data from memory: ${normalizedUrl}`);
    return {
      ...cached,
      source: 'cache'
    };
  }

  // Check circuit breaker
  const domain = getDomainType(normalizedUrl);
  if (isFailedDomain(domain)) {
    debug(`[DataAccess/OpenGraph] Domain ${domain} is in circuit breaker (failed within TTL), using fallback`);
    return createFallbackResult(normalizedUrl, 'Domain temporarily unavailable');
  }

  // If we have stale cache and should refresh, start background refresh
  if (cached && shouldRefresh && !skipExternalFetch) {
    debug(`[DataAccess/OpenGraph] Using stale cache while refreshing in background: ${normalizedUrl}`);
    
    // Start background refresh but don't await it
    refreshOpenGraphData(normalizedUrl).catch(error => {
      console.error(`[DataAccess/OpenGraph] Background refresh failed for ${normalizedUrl}:`, error);
    });
    
    return {
      ...cached,
      source: 'cache'
    };
  }

  // Try to load from S3 if no memory cache
  if (!cached) {
    try {
      const s3Data = await readJsonS3<OgResult>(`${OPENGRAPH_METADATA_S3_DIR}/${urlHash}.json`);
      if (s3Data) {
        if (s3Data && 
            typeof s3Data.timestamp === 'number' &&
            typeof s3Data.source === 'string' &&
            (s3Data.ogMetadata && typeof s3Data.ogMetadata === 'object')) {
          debug(`[DataAccess/OpenGraph] ✅ Successfully loaded from S3 cache: ${normalizedUrl}`);
          // Update memory cache
          ServerCacheInstance.setOpenGraphData(normalizedUrl, s3Data);
          // Check if S3 data is stale
          const isStale = Date.now() - s3Data.timestamp > OPENGRAPH_CACHE_DURATION.REVALIDATION * 1000;
          if (!isStale || skipExternalFetch) {
            return { ...s3Data, source: 'cache' };
          }
        } else {
          console.warn(`[DataAccess/OpenGraph] Malformed S3 data for ${normalizedUrl}, ignoring cached data`);
        }
      }
    } catch (error) {
      console.warn(`[DataAccess/OpenGraph] Failed to read from S3 for ${normalizedUrl}:`, error);
    }
  }

  // If skipping external fetch, return what we have or fallback
  if (skipExternalFetch) {
    if (cached) {
      return {
        ...cached,
        source: 'cache'
      };
    }
    return createFallbackResult(normalizedUrl, 'External fetch disabled');
  }

  // Fetch fresh data from external source
  debug(`[DataAccess/OpenGraph] 🌐 Fetching fresh data from external source: ${normalizedUrl}`);
  const freshData = await refreshOpenGraphData(normalizedUrl);
  
  if (freshData) {
    return freshData;
  }

  // Final fallback - return cached data if available, otherwise create fallback
  if (cached) {
    debug(`[DataAccess/OpenGraph] Using stale cache as final fallback: ${normalizedUrl}`);
    return {
      ...cached,
      source: 'cache'
    };
  }

  return createFallbackResult(normalizedUrl, 'All fetch attempts failed');
}

/**
 * Refreshes OpenGraph data from external source and updates cache/storage
 *
 * @param url - URL to refresh data for
 * @returns Promise resolving to fresh OpenGraph data or null if failed
 */
async function refreshOpenGraphData(url: string): Promise<OgResult | null> {
  const normalizedUrl = normalizeUrl(url);
  const urlHash = hashUrl(normalizedUrl);

  // Check if fetch is already in progress
  if (inFlightOgPromises.has(normalizedUrl)) {
    debug(`[DataAccess/OpenGraph] Fetch already in progress for: ${normalizedUrl}`);
    const existingPromise = inFlightOgPromises.get(normalizedUrl);
    if (existingPromise) {
      return existingPromise;
    }
  }

  const fetchPromise = fetchExternalOpenGraphWithRetry(normalizedUrl)
    .then(async (result) => {
      if (result) {
        try {
          // Store metadata in S3
          await writeJsonS3(`${OPENGRAPH_METADATA_S3_DIR}/${urlHash}.json`, result);
          
          // Cache images if they exist
          if (result.imageUrl && isValidImageUrl(result.imageUrl)) {
            await cacheOpenGraphImage(result.imageUrl);
          }
          if (result.bannerImageUrl && isValidImageUrl(result.bannerImageUrl)) {
            await cacheOpenGraphImage(result.bannerImageUrl);
          }
          
          // Update memory cache
          ServerCacheInstance.setOpenGraphData(normalizedUrl, result, false);
          
          debug(`[DataAccess/OpenGraph] Successfully refreshed and cached: ${normalizedUrl}`);
          return result;
        } catch (storageError) {
          console.error(`[DataAccess/OpenGraph] Failed to store data for ${normalizedUrl}:`, storageError);
          // Still return the result even if storage failed
          return result;
        }
      } else {
        // Mark as failed in cache
        const failureResult = createFallbackResult(normalizedUrl, 'External fetch failed');
        ServerCacheInstance.setOpenGraphData(normalizedUrl, failureResult, true);
        
        // Add to circuit breaker
        const domain = getDomainType(normalizedUrl);
        addFailedDomain(domain); // Use the new function with TTL management
        
        return null;
      }
    })
    .finally(() => {
      inFlightOgPromises.delete(normalizedUrl);
    });

  inFlightOgPromises.set(normalizedUrl, fetchPromise);
  return fetchPromise;
}

/**
 * Fetches OpenGraph data from external source with retry logic
 *
 * @param url - URL to fetch
 * @returns Promise resolving to OpenGraph result or null if failed
 */
async function fetchExternalOpenGraphWithRetry(url: string): Promise<OgResult | null> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < OPENGRAPH_FETCH_CONFIG.MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = calculateBackoffDelay(
          attempt - 1,
          OPENGRAPH_FETCH_CONFIG.BACKOFF_BASE,
          OPENGRAPH_FETCH_CONFIG.MAX_BACKOFF
        );
        debug(`[DataAccess/OpenGraph] Retry attempt ${attempt} for ${url} after ${delay}ms delay`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const result = await fetchExternalOpenGraph(url);
      if (result) {
        debug(`[DataAccess/OpenGraph] Successfully fetched on attempt ${attempt + 1}: ${url}`);
        return result;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      debugWarn(`[DataAccess/OpenGraph] Attempt ${attempt + 1} failed for ${url}:`, lastError.message);
      
      // Check if we should retry this error
      if (!shouldRetryUrl(lastError)) {
        debug(`[DataAccess/OpenGraph] Non-retryable error, stopping attempts: ${lastError.message}`);
        break;
      }
    }
  }

  console.error(`[DataAccess/OpenGraph] All retry attempts exhausted for ${url}. Last error:`, lastError?.message);
  return null;
}

/**
 * Fetches OpenGraph data from a single external source
 *
 * @param url - URL to fetch
 * @returns Promise resolving to OpenGraph result or null if failed
 */
async function fetchExternalOpenGraph(url: string): Promise<OgResult | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, OPENGRAPH_FETCH_CONFIG.TIMEOUT);

  try {
    // Wait for permit from rate limiter before making the external call
    await waitForPermit(OPENGRAPH_FETCH_STORE_NAME, OPENGRAPH_FETCH_CONTEXT_ID, DEFAULT_OPENGRAPH_FETCH_LIMIT_CONFIG);

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    };

    debug(`[DataAccess/OpenGraph] Fetching HTML from: ${url}`);
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    debug(`[DataAccess/OpenGraph] Successfully fetched HTML (${html.length} bytes) from: ${url}`);

    // Extract OpenGraph metadata
    const ogMetadata = extractOpenGraphTags(html, url);
    const sanitizedMetadata = sanitizeOgMetadata(ogMetadata);

    // Create result
    const result: OgResult = {
      imageUrl: sanitizedMetadata.profileImage || sanitizedMetadata.image || sanitizedMetadata.twitterImage || null,
      bannerImageUrl: sanitizedMetadata.bannerImage || null,
      ogMetadata: sanitizedMetadata,
      timestamp: Date.now(),
      source: 'external',
      actualUrl: response.url !== url ? response.url : undefined
    };

    debug(`[DataAccess/OpenGraph] Extracted metadata for ${url}:`, {
      title: sanitizedMetadata.title,
      imageUrl: result.imageUrl,
      bannerImageUrl: result.bannerImageUrl
    });

    return result;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      const timeoutMessage = `Request timeout after ${OPENGRAPH_FETCH_CONFIG.TIMEOUT}ms`;
      debugWarn(`[DataAccess/OpenGraph] ${timeoutMessage} for ${url}`);
      throw new Error(timeoutMessage);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Extracts OpenGraph tags from HTML content
 *
 * @param html - HTML content to parse
 * @param url - Source URL for context
 * @returns Extracted metadata object
 */
function extractOpenGraphTags(html: string, url: string): Record<string, string | null> {
  // Limit HTML size to prevent ReDoS and excessive processing time
  const MAX_HTML_SIZE_BYTES = 1 * 1024 * 1024; // 1MB
  if (html.length > MAX_HTML_SIZE_BYTES) {
    debugWarn(`[DataAccess/OpenGraph] HTML content for ${url} exceeds ${MAX_HTML_SIZE_BYTES / (1024 * 1024)}MB limit. Skipping parsing.`);
    return {
      title: `Content too large to parse from ${getDomainType(url)}`,
      description: 'HTML content was too large to process for OpenGraph metadata.',
      url: url,
    };
  }

  const $ = cheerio.load(html);
  const domain = getDomainType(url);

  const getMetaContent = (selectors: string[]): string | null => {
    for (const selector of selectors) {
      const content = $(selector).attr('content');
      if (content) return content.trim();
    }
    return null;
  };
  
  const result: Record<string, string | null> = {
    title: getMetaContent(['meta[property="og:title"]', 'meta[name="twitter:title"]']) || $('title').first().text().trim() || null,
    description: getMetaContent(['meta[property="og:description"]', 'meta[name="twitter:description"]', 'meta[name="description"]']),
    image: getMetaContent(['meta[property="og:image"]']),
    twitterImage: getMetaContent(['meta[name="twitter:image"]', 'meta[name="twitter:image:src"]']),
    site: getMetaContent(['meta[property="og:site_name"]', 'meta[name="twitter:site"]']),
    type: getMetaContent(['meta[property="og:type"]']),
    url: getMetaContent(['meta[property="og:url"]']) || url,
    siteName: getMetaContent(['meta[property="og:site_name"]']),

    // Platform-specific extraction
    profileImage: null,
    bannerImage: null
  };

  // Platform-specific image extraction
  try {
    if (domain === 'GitHub') {
      result.profileImage = extractGitHubProfileImage($);
    } else if (domain === 'X' || domain === 'Twitter') {
      const twitterImages = extractTwitterImages($);
      result.profileImage = twitterImages.profile;
      result.bannerImage = twitterImages.banner;
    } else if (domain === 'LinkedIn') {
      const linkedinImages = extractLinkedInImages($);
      result.profileImage = linkedinImages.profile;
      result.bannerImage = linkedinImages.banner;
    } else if (domain === 'Bluesky') {
      result.profileImage = extractBlueskyProfileImage($);
    }
  } catch (error) {
    debugWarn(`[DataAccess/OpenGraph] Error during platform-specific extraction for ${domain}:`, error);
  }

  return result;
}

// Regex-based helpers extractMetaContent and extractTitleTag are no longer needed
// as Cheerio is used above.

/**
 * Platform-specific image extraction functions using Cheerio
 */
function extractGitHubProfileImage($: cheerio.CheerioAPI): string | null {
  // Common selectors for GitHub profile pictures
  const selectors = [
    'img.avatar', // Standard avatar class
    'img[alt*="avatar"]', // Alt text containing "avatar"
    'a[itemprop="image"] img', // Schema.org itemprop
    'meta[property="og:image"]', // Fallback to OG image if specific avatar not found
    'meta[name="twitter:image"]'
  ];

  for (const selector of selectors) {
    const el = $(selector).first();
    const src = el.attr('src') || el.attr('content');
    if (src) return src.trim();
  }
  return null;
}

function extractTwitterImages($: cheerio.CheerioAPI): { profile: string | null; banner: string | null } {
  let profile: string | null = null;
  let banner: string | null = null;

  // Profile image selectors (these can be very volatile due to Twitter's obfuscated classes)
  // Prioritize more stable attributes if possible
  const profileSelectors = [
    'a[href$="/photo"] img[src*="profile_images"]', // Link to profile photo page containing an image from profile_images
    'img[alt*="Profile image"][src*="profile_images"]',
    'img[data-testid="UserAvatar-Container"] img[src*="profile_images"]', // Test IDs can change
  ];
  for (const selector of profileSelectors) {
    const el = $(selector).first();
    if (el.length) {
      profile = el.attr('src')?.trim() || null;
      if (profile) break;
    }
  }
  // Fallback to general OG/Twitter image if specific profile image not found
  if (!profile) {
    profile = $('meta[property="og:image"]').attr('content')?.trim() || $('meta[name="twitter:image"]').attr('content')?.trim() || null;
  }

  // Banner image selectors
  const bannerSelectors = [
    'a[href$="/header_photo"] img', // Link to header photo page
    'div[data-testid="UserProfileHeader_Banner"] img',
  ];
   for (const selector of bannerSelectors) {
    const el = $(selector).first();
    if (el.length) {
      banner = el.attr('src')?.trim() || null;
      if (banner) break;
    }
  }
  // Fallback for banner (less common in meta tags, but worth a check)
   if (!banner) {
    // Twitter card images sometimes serve as banners if type is summary_large_image
    if ($('meta[name="twitter:card"]').attr('content') === 'summary_large_image') {
        banner = $('meta[name="twitter:image"]').attr('content')?.trim() || null;
        // If this banner is the same as profile, nullify banner to avoid duplication
        if (banner && banner === profile) {
            banner = null;
        }
    }
  }
  return { profile, banner };
}

function extractLinkedInImages($: cheerio.CheerioAPI): { profile: string | null; banner: string | null } {
  let profile: string | null = null;
  let banner: string | null = null;

  // Profile image selectors
  const profileSelectors = [
    'img.profile-photo-edit__preview', // Edit profile view
    'img.pv-top-card-profile-picture__image', // Public profile view
    'section.profile-photo-edit img', // Another potential selector
    'meta[property="og:image"]', // OG image often is the profile pic
  ];
  for (const selector of profileSelectors) {
    const el = $(selector).first();
    if (el.length) {
      profile = el.attr('src')?.trim() || el.attr('content')?.trim() || null;
      if (profile) break;
    }
  }
  
  // Banner image selectors
  // LinkedIn banners are often background images on divs
  const bannerElement = $('div.profile-top-card__banner').first();
  if (bannerElement.length) {
    const style = bannerElement.attr('style');
    if (style) {
      // Use optional chaining for match as style could be undefined, though `if (style)` checks this.
      // More importantly, style.match itself could return null.
      const match = style.match(/background-image:\s*url\((['"]?)(.*?)\1\)/);
      if (match?.[2]) { // Check if match and match[2] are not null/undefined
        banner = match[2];
      }
    }
  }
  // Fallback if not found as background image
  if (!banner) {
     const bannerImg = $('img.profile-banner-image__image').first();
     if (bannerImg.length) {
        banner = bannerImg.attr('src')?.trim() || null;
     }
  }

  return { profile, banner };
}

function extractBlueskyProfileImage($: cheerio.CheerioAPI): string | null {
  // Bluesky profile images are often in meta tags or specific img tags
  const selectors = [
    'meta[property="og:image"]',
    'meta[name="twitter:image"]',
    'img[alt*="avatar"][src*="cdn.bsky.app/img/avatar"]',
    'img[src*="cdn.bsky.app/img/avatar/plain/"]', // More specific avatar URL pattern
  ];
  for (const selector of selectors) {
    const el = $(selector).first();
    const src = el.attr('src') || el.attr('content');
    if (src) return src.trim();
  }
  return null;
}

/**
 * Caches an OpenGraph image to S3 storage
 *
 * @param imageUrl - URL of image to cache
 * @returns Promise resolving to S3 key or null if failed
 */
async function cacheOpenGraphImage(imageUrl: string): Promise<string | null> {
  try {
    const response = await fetch(imageUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OpenGraph-Cache/1.0)'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const imageHash = hashImageContent(buffer);
    const extension = getImageExtension(imageUrl);
    const s3Key = `${OPENGRAPH_IMAGES_S3_DIR}/${imageHash}.${extension}`;

    // TODO: Implement actual S3 storage using a utility like writeBufferS3
    // Example: await writeBufferS3(s3Key, buffer, `image/${extension}`);
    console.log(`[DataAccess/OpenGraph] TODO: Image caching not implemented. Would cache ${imageUrl} to S3 key: ${s3Key}`);
    
    return s3Key;
  } catch (error) {
    console.warn(`[DataAccess/OpenGraph] Failed to cache image ${imageUrl}:`, error);
    return null;
  }
}

/**
 * Creates a fallback result when OpenGraph data cannot be fetched
 *
 * @param url - Original URL
 * @param error - Error message
 * @returns Fallback OpenGraph result
 */
function createFallbackResult(url: string, error: string): OgResult {
  const domain = getDomainType(url);
  
  return {
    imageUrl: getFallbackImageForDomain(domain),
    bannerImageUrl: getFallbackBannerForDomain(domain),
    ogMetadata: {
      title: `Profile on ${domain}`,
      description: 'Social media profile',
      site: domain,
      url: url
    },
    error,
    timestamp: Date.now(),
    source: 'fallback'
  };
}

/**
 * Gets fallback profile image for a domain
 */
function getFallbackImageForDomain(domain: string): string | null {
  return FALLBACK_IMAGES[domain] || FALLBACK_IMAGES.default;
}

/**
 * Gets fallback banner image for a domain
 */
function getFallbackBannerForDomain(domain: string): string | null {
  const fallbacks: Record<string, string> = {
    'GitHub': '/images/social-banners/github.svg',
    'X': '/images/social-banners/twitter-x.svg',
    'Twitter': '/images/social-banners/twitter-x.svg',
    'LinkedIn': '/images/social-banners/linkedin.svg',
    'Discord': '/images/social-banners/discord.svg',
    'Bluesky': '/images/social-banners/bluesky.png'
  };
  
  return fallbacks[domain] || null;
}
