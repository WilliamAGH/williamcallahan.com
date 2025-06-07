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

// --- Configuration & Constants ---
export const OPENGRAPH_S3_KEY_DIR = 'opengraph';
export const OPENGRAPH_METADATA_S3_DIR = `${OPENGRAPH_S3_KEY_DIR}/metadata`;
export const OPENGRAPH_IMAGES_S3_DIR = `${OPENGRAPH_S3_KEY_DIR}/images`;

// --- Circuit Breaker & Session Management ---
const SESSION_FAILED_DOMAINS = new Set<string>();
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
  
  console.log(`[DataAccess/OpenGraph] Fetching OG data for: ${normalizedUrl}`);

  // Validate URL first
  if (!validateOgUrl(normalizedUrl)) {
    console.warn(`[DataAccess/OpenGraph] Invalid or unsafe URL: ${normalizedUrl}`);
    return createFallbackResult(normalizedUrl, 'Invalid or unsafe URL');
  }

  // Check memory cache first
  const cached = ServerCacheInstance.getOpenGraphData(normalizedUrl);
  const shouldRefresh = ServerCacheInstance.shouldRefreshOpenGraph(normalizedUrl);

  if (cached && !shouldRefresh) {
    console.log(`[DataAccess/OpenGraph] Returning fresh cached data for: ${normalizedUrl}`);
    return {
      ...cached,
      source: 'cache'
    };
  }

  // Check circuit breaker
  const domain = getDomainType(normalizedUrl);
  if (SESSION_FAILED_DOMAINS.has(domain)) {
    console.log(`[DataAccess/OpenGraph] Domain ${domain} is in circuit breaker, using fallback`);
    return createFallbackResult(normalizedUrl, 'Domain temporarily unavailable');
  }

  // If we have stale cache and should refresh, start background refresh
  if (cached && shouldRefresh && !skipExternalFetch) {
    console.log(`[DataAccess/OpenGraph] Using stale cache while refreshing in background: ${normalizedUrl}`);
    
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
        if (typeof s3Data.timestamp === 'number') {
          console.log(`[DataAccess/OpenGraph] Loaded from S3: ${normalizedUrl}`);
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
  console.log(`[DataAccess/OpenGraph] Fetching fresh data for: ${normalizedUrl}`);
  const freshData = await refreshOpenGraphData(normalizedUrl);
  
  if (freshData) {
    return freshData;
  }

  // Final fallback - return cached data if available, otherwise create fallback
  if (cached) {
    console.log(`[DataAccess/OpenGraph] Using stale cache as final fallback: ${normalizedUrl}`);
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
    console.log(`[DataAccess/OpenGraph] Fetch already in progress for: ${normalizedUrl}`);
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
          
          console.log(`[DataAccess/OpenGraph] Successfully refreshed and cached: ${normalizedUrl}`);
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
        SESSION_FAILED_DOMAINS.add(domain);
        
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
        console.log(`[DataAccess/OpenGraph] Retry attempt ${attempt} for ${url} after ${delay}ms delay`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const result = await fetchExternalOpenGraph(url);
      if (result) {
        console.log(`[DataAccess/OpenGraph] Successfully fetched on attempt ${attempt + 1}: ${url}`);
        return result;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[DataAccess/OpenGraph] Attempt ${attempt + 1} failed for ${url}:`, lastError.message);
      
      // Check if we should retry this error
      if (!shouldRetryUrl(lastError)) {
        console.log(`[DataAccess/OpenGraph] Non-retryable error, stopping attempts: ${lastError.message}`);
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
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    };

    console.log(`[DataAccess/OpenGraph] Fetching HTML from: ${url}`);
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
    console.log(`[DataAccess/OpenGraph] Successfully fetched HTML (${html.length} bytes) from: ${url}`);

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

    console.log(`[DataAccess/OpenGraph] Extracted metadata for ${url}:`, {
      title: sanitizedMetadata.title,
      imageUrl: result.imageUrl,
      bannerImageUrl: result.bannerImageUrl
    });

    return result;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      const isDev = process.env.NODE_ENV === 'development';
      const timeoutMessage = `Request timeout after ${OPENGRAPH_FETCH_CONFIG.TIMEOUT}ms`;
      if (isDev) {
        console.warn(`[DataAccess/OpenGraph] [DEV] ${timeoutMessage} for ${url}`);
      }
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
  const domain = getDomainType(url);
  
  const result: Record<string, string | null> = {
    title: extractMetaContent(html, 'property="og:title"') ||
           extractMetaContent(html, 'name="twitter:title"') ||
           extractTitleTag(html),

    description: extractMetaContent(html, 'property="og:description"') ||
                 extractMetaContent(html, 'name="twitter:description"') ||
                 extractMetaContent(html, 'name="description"'),

    image: extractMetaContent(html, 'property="og:image"'),

    twitterImage: extractMetaContent(html, 'name="twitter:image"') ||
                 extractMetaContent(html, 'name="twitter:image:src"'),

    site: extractMetaContent(html, 'property="og:site_name"') ||
          extractMetaContent(html, 'name="twitter:site"'),

    type: extractMetaContent(html, 'property="og:type"'),

    url: extractMetaContent(html, 'property="og:url"') || url,

    siteName: extractMetaContent(html, 'property="og:site_name"'),

    // Platform-specific extraction
    profileImage: null,
    bannerImage: null
  };

  // Platform-specific image extraction
  try {
    if (domain === 'GitHub') {
      result.profileImage = extractGitHubProfileImage(html);
    } else if (domain === 'X' || domain === 'Twitter') {
      const twitterImages = extractTwitterImages(html);
      result.profileImage = twitterImages.profile;
      result.bannerImage = twitterImages.banner;
    } else if (domain === 'LinkedIn') {
      const linkedinImages = extractLinkedInImages(html);
      result.profileImage = linkedinImages.profile;
      result.bannerImage = linkedinImages.banner;
    } else if (domain === 'Bluesky') {
      result.profileImage = extractBlueskyProfileImage(html);
    }
  } catch (error) {
    console.warn(`[DataAccess/OpenGraph] Error during platform-specific extraction for ${domain}:`, error);
  }

  return result;
}

/**
 * Helper function to extract content from meta tags
 */
function extractMetaContent(html: string, attributePattern: string): string | null {
  const pattern = new RegExp(`<meta[^>]*${attributePattern}[^>]*content=["']([^"']+)["'][^>]*>`, 'i');
  const alternatePattern = new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*${attributePattern}[^>]*>`, 'i');
  
  const match = html.match(pattern) || html.match(alternatePattern);
  return match?.[1] ?? null;
}

/**
 * Extracts title from title tag as fallback
 */
function extractTitleTag(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1]?.trim() ?? null;
}

/**
 * Platform-specific image extraction functions
 */
function extractGitHubProfileImage(html: string): string | null {
  const patterns = [
    /<img[^>]*class="[^"]*avatar[^"]*"[^>]*src="([^"]+)"/i,
    /<img[^>]*src="([^"]+)"[^>]*class="[^"]*avatar[^"]*"/i
  ];
  
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1];
  }
  
  return null;
}

function extractTwitterImages(html: string): { profile: string | null; banner: string | null } {
  const profilePatterns = [
    /<img[^>]*class="[^"]*css-9pa8cd[^"]*"[^>]*src="([^"]+)"/i,
    /<img[^>]*src="([^"]+)"[^>]*alt="[^"]*profile image/i
  ];
  
  let profile: string | null = null;
  for (const pattern of profilePatterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      profile = match[1];
      break;
    }
  }
  
  const bannerPattern = /<div[^>]*style="[^"]*background-image:\s*url\(([^)]+)\)"/i;
  const bannerMatch = html.match(bannerPattern);
  const banner = bannerMatch?.[1]?.replace(/['"]/g, '') ?? null;
  
  return { profile, banner };
}

function extractLinkedInImages(html: string): { profile: string | null; banner: string | null } {
  const profilePatterns = [
    /<img[^>]*class="[^"]*profile-picture[^"]*"[^>]*src="([^"]+)"/i,
    /<img[^>]*class="[^"]*pv-top-card-profile-picture__image[^"]*"[^>]*src="([^"]+)"/i
  ];
  
  let profile: string | null = null;
  for (const pattern of profilePatterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      profile = match[1];
      break;
    }
  }
  
  const bannerPattern = /<img[^>]*class="[^"]*profile-background-image[^"]*"[^>]*src="([^"]+)"/i;
  const bannerMatch = html.match(bannerPattern);
  const banner = bannerMatch?.[1] ?? null;
  
  return { profile, banner };
}

function extractBlueskyProfileImage(html: string): string | null {
  const patterns = [
    /<img[^>]*class="[^"]*avatar[^"]*"[^>]*src="([^"]+)"/i,
    /https:\/\/cdn\.bsky\.app\/img\/avatar\/plain\/[^"'\s]+/i
  ];
  
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[0] || match?.[1]) {
      return match[1] || match[0];
    }
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

    // Store image in S3 (implementation would depend on your S3 utilities)
    // For now, we'll just log the intent
    console.log(`[DataAccess/OpenGraph] Would cache image ${imageUrl} to S3 key: ${s3Key}`);
    
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
