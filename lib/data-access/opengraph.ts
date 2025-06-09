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
  constructKarakeepAssetUrl
} from '@/lib/utils/opengraph-utils';
import type { OgResult, KarakeepImageFallback } from '@/types';
import * as cheerio from 'cheerio';
import { waitForPermit, OPENGRAPH_FETCH_STORE_NAME, OPENGRAPH_FETCH_CONTEXT_ID, DEFAULT_OPENGRAPH_FETCH_LIMIT_CONFIG } from '@/lib/rate-limiter';
import { debug, debugWarn } from '@/lib/utils/debug';
import { persistImageToS3, findImageInS3, serveImageFromS3 } from '@/lib/utils/image-s3-utils';
import { getBrowserHeaders } from '@/lib/data-access/logos/external-fetch';
import { markDomainAsFailed, hasDomainFailedTooManyTimes } from '@/lib/data-access/logos/session';

// --- Configuration & Constants ---
export const OPENGRAPH_S3_KEY_DIR = 'opengraph';
export const OPENGRAPH_METADATA_S3_DIR = `${OPENGRAPH_S3_KEY_DIR}/metadata`;
export const OPENGRAPH_IMAGES_S3_DIR = 'images/opengraph';

const inFlightOgPromises: Map<string, Promise<OgResult | null>> = new Map();

/**
 * Schedules image persistence to happen in the background without blocking the response
 * 
 * @param imageUrl - URL of image to persist
 * @param s3Directory - S3 directory to store in
 * @param logContext - Context for logging
 * @param idempotencyKey - Unique key for idempotent storage
 * @param pageUrl - URL of the page the image belongs to
 */
function scheduleImagePersistence(
  imageUrl: string,
  s3Directory: string,
  logContext: string,
  idempotencyKey?: string,
  pageUrl?: string,
): void {
  // Run in background - don't await or block
  persistImageToS3(imageUrl, s3Directory, logContext, idempotencyKey, pageUrl)
    .then((s3Key) => {
      if (s3Key) {
        debug(`[DataAccess/OpenGraph] Background persistence completed: ${s3Key}`);
      }
    })
    .catch((error) => {
      // Log error but don't throw - this is background processing
      const errorMessage = error instanceof Error ? error.message : String(error);
      debug(`[DataAccess/OpenGraph] Background persistence failed for ${imageUrl}: ${errorMessage}`);
    });
}

// Use existing fallback functions from og-image route

/**
 * Retrieves OpenGraph data using a multi-layered approach for optimal performance
 * 
 * **Retrieval order:**
 * 1. **Memory cache** (fastest) - In-memory storage for immediate reuse
 * 2. **S3 persistent storage** (fast) - Durable storage surviving server restarts  
 * 3. **External API** (slowest) - Fresh fetch from source URL
 * 
 * **Persistence strategy:**
 * When fetching externally, data is stored in both memory cache and S3 persistent storage
 * 
 * @param url - URL to get OpenGraph data for
 * @param skipExternalFetch - If true, only check in-memory cache and S3 persistent storage
 * @param idempotencyKey - A unique key to ensure idempotent image storage, such as a bookmark ID
 * @param fallbackImageData - Optional Karakeep image data to use as fallback when external fetch fails
 * @returns Promise resolving to OpenGraph data with images served from S3 when available
 */
export async function getOpenGraphData(
  url: string,
  skipExternalFetch = false,
  idempotencyKey?: string,
  fallbackImageData?: KarakeepImageFallback,
): Promise<OgResult> {
  const normalizedUrl = normalizeUrl(url);
  const urlHash = hashUrl(normalizedUrl);
  
  debug(`[DataAccess/OpenGraph] 🔍 Getting OpenGraph data for: ${normalizedUrl}`);

  // Validate URL first
  if (!validateOgUrl(normalizedUrl)) {
    console.warn(`[DataAccess/OpenGraph] Invalid or unsafe URL: ${normalizedUrl}`);
    return createFallbackResult(normalizedUrl, 'Invalid or unsafe URL', fallbackImageData);
  }

  // Check memory cache first
  const cached = ServerCacheInstance.getOpenGraphData(normalizedUrl);
  if (cached && Date.now() - cached.timestamp < OPENGRAPH_CACHE_DURATION.SUCCESS * 1000) {
    debug(`[DataAccess/OpenGraph] 📋 Returning from memory cache: ${normalizedUrl}`);
    
    // Update memory cache result with S3 URLs if available
    const updatedResult = { ...cached };
    
    // Check if we can upgrade external URLs to S3 persisted URLs (non-blocking)
    if (cached.imageUrl?.startsWith('http') && isValidImageUrl(cached.imageUrl)) {
      const persistedImageKey = await findImageInS3(
        cached.imageUrl,
        OPENGRAPH_IMAGES_S3_DIR,
        'OpenGraph',
        idempotencyKey,
        normalizedUrl,
      );
      
      if (persistedImageKey) {
        updatedResult.imageUrl = persistedImageKey;
        debug(`[DataAccess/OpenGraph] Upgraded image URL to S3: ${persistedImageKey}`);
      } else {
        // Don't block response - schedule background persistence
        debug(`[DataAccess/OpenGraph] Image not in S3, scheduling background persistence: ${cached.imageUrl}`);
        scheduleImagePersistence(cached.imageUrl, OPENGRAPH_IMAGES_S3_DIR, 'OpenGraph', idempotencyKey, normalizedUrl);
      }
    }
    
    if (cached.bannerImageUrl?.startsWith('http') && isValidImageUrl(cached.bannerImageUrl)) {
      const persistedBannerKey = await findImageInS3(
        cached.bannerImageUrl,
        OPENGRAPH_IMAGES_S3_DIR,
        'OpenGraph',
        idempotencyKey,
        normalizedUrl,
      );
      
      if (persistedBannerKey) {
        updatedResult.bannerImageUrl = persistedBannerKey;
        debug(`[DataAccess/OpenGraph] Upgraded banner URL to S3: ${persistedBannerKey}`);
      } else {
        // Don't block response - schedule background persistence
        debug(`[DataAccess/OpenGraph] Banner not in S3, scheduling background persistence: ${cached.bannerImageUrl}`);
        scheduleImagePersistence(cached.bannerImageUrl, OPENGRAPH_IMAGES_S3_DIR, 'OpenGraph', idempotencyKey, normalizedUrl);
      }
    }
    
    // Update memory cache if we made any upgrades
    if (updatedResult.imageUrl !== cached.imageUrl || updatedResult.bannerImageUrl !== cached.bannerImageUrl) {
      ServerCacheInstance.setOpenGraphData(normalizedUrl, updatedResult, false);
    }
    
    return updatedResult;
  }

  // Check circuit breaker using existing session management
  const domain = getDomainType(normalizedUrl);
  if (hasDomainFailedTooManyTimes(domain)) {
    debug(`[DataAccess/OpenGraph] Domain ${domain} has failed too many times, using fallback`);
    return createFallbackResult(normalizedUrl, 'Domain temporarily unavailable', fallbackImageData);
  }

  // If we have stale in-memory cache and should refresh, start background refresh
  if (cached && !skipExternalFetch) {
    debug(`[DataAccess/OpenGraph] Using stale memory cache while refreshing in background: ${normalizedUrl}`);
    
    // Start background refresh but don't await it
    refreshOpenGraphData(normalizedUrl, idempotencyKey, fallbackImageData).catch(error => {
      console.error(`[DataAccess/OpenGraph] Background refresh failed for ${normalizedUrl}:`, error);
    });
    
    return {
      ...cached,
      source: 'cache'
    };
  }

  // Try to read from S3 persistent storage if not in memory cache
  try {
    const stored = await readJsonS3(`${OPENGRAPH_METADATA_S3_DIR}/${urlHash}.json`);
    if (stored && typeof stored === 'object') {
      const storedResult = stored as OgResult;
      debug(`[DataAccess/OpenGraph] 📁 Found in S3 storage: ${normalizedUrl}`);
      
      // Update stored result with S3 URLs if available
      const updatedStoredResult = { ...storedResult };
      
                  // Check if we can upgrade external URLs to S3 persisted URLs (non-blocking)
     if (storedResult.imageUrl?.startsWith('http') && isValidImageUrl(storedResult.imageUrl)) {
       const persistedImageKey = await findImageInS3(
         storedResult.imageUrl,
         OPENGRAPH_IMAGES_S3_DIR,
         'OpenGraph',
         idempotencyKey,
         normalizedUrl,
       );
       
       if (persistedImageKey) {
         updatedStoredResult.imageUrl = persistedImageKey;
         debug(`[DataAccess/OpenGraph] Upgraded stored image URL to S3: ${persistedImageKey}`);
       } else {
         // Don't block response - schedule background persistence
         debug(`[DataAccess/OpenGraph] Image not in S3, scheduling background persistence: ${storedResult.imageUrl}`);
         scheduleImagePersistence(storedResult.imageUrl, OPENGRAPH_IMAGES_S3_DIR, 'OpenGraph', idempotencyKey, normalizedUrl);
       }
     }
     
     if (storedResult.bannerImageUrl?.startsWith('http') && isValidImageUrl(storedResult.bannerImageUrl)) {
       const persistedBannerKey = await findImageInS3(
         storedResult.bannerImageUrl,
         OPENGRAPH_IMAGES_S3_DIR,
         'OpenGraph',
         idempotencyKey,
         normalizedUrl,
       );
       
       if (persistedBannerKey) {
         updatedStoredResult.bannerImageUrl = persistedBannerKey;
         debug(`[DataAccess/OpenGraph] Upgraded stored banner URL to S3: ${persistedBannerKey}`);
       } else {
         // Don't block response - schedule background persistence
         debug(`[DataAccess/OpenGraph] Banner not in S3, scheduling background persistence: ${storedResult.bannerImageUrl}`);
         scheduleImagePersistence(storedResult.bannerImageUrl, OPENGRAPH_IMAGES_S3_DIR, 'OpenGraph', idempotencyKey, normalizedUrl);
       }
     }
      
      // Store in memory cache and return
      ServerCacheInstance.setOpenGraphData(normalizedUrl, updatedStoredResult, false);
      return updatedStoredResult;
    }
  } catch (error) {
    console.warn(`[DataAccess/OpenGraph] Failed to read from S3 for ${normalizedUrl}:`, error);
  }

  // If skipping external fetch, return what we have or fallback
  if (skipExternalFetch) {
    if (cached) {
      return {
        ...cached,
        source: 'cache'
      };
    }
    return createFallbackResult(normalizedUrl, 'External fetch disabled', fallbackImageData);
  }

  // Fetch fresh data from external source
  debug(`[DataAccess/OpenGraph] 🌐 Fetching fresh data from external source: ${normalizedUrl}`);
  const freshData = await refreshOpenGraphData(normalizedUrl, idempotencyKey, fallbackImageData);
  
  if (freshData) {
    return freshData;
  }

  // Final fallback - return memory cached data if available, otherwise create fallback
  if (cached) {
    debug(`[DataAccess/OpenGraph] Using stale memory cache as final fallback: ${normalizedUrl}`);
    return {
      ...cached,
      source: 'cache'
    };
  }

  return createFallbackResult(normalizedUrl, 'All fetch attempts failed', fallbackImageData);
}

/**
 * Refreshes OpenGraph data from external source and updates S3 persistent storage and in-memory cache
 *
 * @param url - URL to refresh data for
 * @param idempotencyKey - A unique key to ensure idempotent image storage
 * @param fallbackImageData - Optional Karakeep image data to use as fallback when external fetch fails
 * @returns Promise resolving to fresh OpenGraph data or null if failed
 */
async function refreshOpenGraphData(url: string, idempotencyKey?: string, fallbackImageData?: KarakeepImageFallback): Promise<OgResult | null> {
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

  // Helper to persist an image and return its S3 key, or the original URL on failure
  const persistImage = async (imageUrl: string | null | undefined): Promise<string | null> => {
    if (!imageUrl || !isValidImageUrl(imageUrl)) {
      return null;
    }

    try {
      // Check if already persisted to S3 first
      let persistedKey = await findImageInS3(
        imageUrl,
        OPENGRAPH_IMAGES_S3_DIR,
        'OpenGraph',
        idempotencyKey,
        url,
      );

      if (persistedKey) {
        debug(`[DataAccess/OpenGraph] Using existing persisted image: ${persistedKey}`);
        return persistedKey;
      }

      // If not, persist it now
      persistedKey = await persistImageToS3(
        imageUrl,
        OPENGRAPH_IMAGES_S3_DIR,
        'OpenGraph',
        idempotencyKey,
        url,
      );

      if (persistedKey) {
        debug(`[DataAccess/OpenGraph] Persisted new image, using S3 reference: ${persistedKey}`);
        return persistedKey;
      }
    } catch (error) {
      console.error(`[DataAccess/OpenGraph] Failed to persist image ${imageUrl}:`, error);
    }

    // Fallback to original URL if persistence fails
    return imageUrl;
  };

  const fetchPromise = fetchExternalOpenGraphWithRetry(normalizedUrl)
    .then(async (result) => {
      if (result) {
        try {
          // Store metadata in S3 persistent storage before image processing
          await writeJsonS3(`${OPENGRAPH_METADATA_S3_DIR}/${urlHash}.json`, { ...result, imageUrl: result.imageUrl, bannerImageUrl: result.bannerImageUrl });

          // Persist images to S3 and update URLs to use S3 versions
          const finalImageUrl = await persistImage(result.imageUrl) ?? result.imageUrl;
          const finalBannerImageUrl = await persistImage(result.bannerImageUrl) ?? result.bannerImageUrl;

          // Create the final result with S3 URLs where available
          const finalResult: OgResult = {
            ...result,
            imageUrl: finalImageUrl,
            bannerImageUrl: finalBannerImageUrl,
          };

          // Update memory cache with final result
          ServerCacheInstance.setOpenGraphData(normalizedUrl, finalResult, false);

          debug(`[DataAccess/OpenGraph] Successfully refreshed and stored data for: ${normalizedUrl}`);
          return finalResult;
        } catch (storageError) {
          console.error(`[DataAccess/OpenGraph] Failed to store data for ${normalizedUrl}:`, storageError);
          // Still return the result even if storage failed
          return result;
        }
      } else {
        // Mark as failed in memory cache
        const failureResult = createFallbackResult(normalizedUrl, 'External fetch failed', fallbackImageData);
        ServerCacheInstance.setOpenGraphData(normalizedUrl, failureResult, true);
        
        // Add to circuit breaker using existing session management
        const domain = getDomainType(normalizedUrl);
        markDomainAsFailed(domain);
        
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
  // Check circuit breaker before attempting fetch
  const domain = getDomainType(url);
  if (hasDomainFailedTooManyTimes(domain)) {
    debugWarn(`[DataAccess/OpenGraph] Skipping ${url} - domain ${domain} has failed too many times`);
    return null;
  }

  const controller = new AbortController();
  
  // Increase max listeners to handle concurrent requests safely
  // AbortSignal extends EventTarget which has setMaxListeners in Node.js
  if ('setMaxListeners' in controller.signal && typeof (controller.signal as { setMaxListeners?: (n: number) => void }).setMaxListeners === 'function') {
    (controller.signal as { setMaxListeners: (n: number) => void }).setMaxListeners(20);
  }
  
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, OPENGRAPH_FETCH_CONFIG.TIMEOUT);

  try {
    // Wait for permit from rate limiter before making the external call
    await waitForPermit(OPENGRAPH_FETCH_STORE_NAME, OPENGRAPH_FETCH_CONTEXT_ID, DEFAULT_OPENGRAPH_FETCH_LIMIT_CONFIG);

    // Use existing getBrowserHeaders function from logo system
    const headers = getBrowserHeaders();

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
    
    // Add domain to failed list for circuit breaker
    const domain = getDomainType(url);
    markDomainAsFailed(domain);
    
    // Log different error types with appropriate detail level
    if (error instanceof Error) {
      if (error.message.includes('fetch failed') || error.message.includes('ENOTFOUND')) {
        debugWarn(`[DataAccess/OpenGraph] Network error for ${url}: Connection failed`);
      } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
        debugWarn(`[DataAccess/OpenGraph] Access denied for ${url}: ${error.message}`);
      } else {
        debugWarn(`[DataAccess/OpenGraph] Error fetching ${url}: ${error.message}`);
      }
    }
    
    throw error;
  } finally {
    clearTimeout(timeoutId);
    // Ensure the controller is properly cleaned up
    if (!controller.signal.aborted) {
      try {
        controller.abort();
      } catch {
        // Ignore cleanup errors
      }
    }
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
  if (Buffer.byteLength(html, 'utf8') > MAX_HTML_SIZE_BYTES) {
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
      if (content) {
        // Decode HTML entities to prevent malformed URLs
        const decoded = $('<div>').html(content.trim()).text();
        return decoded;
      }
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
  // Common selectors for GitHub profile pictures, ordered by specificity
  const selectors = [
    'img.avatar-user',                  // Most specific selector for user profile pages
    'img.avatar',                       // Standard avatar class
    'img[alt*="avatar"]',               // Alt text containing "avatar"
    'a[itemprop="image"] img',          // Schema.org itemprop
    'meta[property="og:image"]',        // Fallback to OG image if specific avatar not found
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
 * Creates a fallback result when OpenGraph data cannot be fetched
 * Prioritizes Karakeep image data when available before falling back to domain defaults
 *
 * @param url - Original URL
 * @param error - Error message
 * @param fallbackImageData - Optional Karakeep image data to use as fallback
 * @returns Fallback OpenGraph result
 */
function createFallbackResult(url: string, error: string, fallbackImageData?: KarakeepImageFallback): OgResult {
  const domain = getDomainType(url);
  
  // Priority chain for image selection:
  // 1. Karakeep imageUrl (direct OG image)
  // 2. Karakeep imageAssetId (construct asset URL)
  // 3. Karakeep screenshotAssetId (construct screenshot URL)
  // 4. Domain fallback images
  let imageUrl: string | null = null;

  if (fallbackImageData) {
    // Try Karakeep imageUrl first (highest priority)
    if (fallbackImageData.imageUrl && isValidImageUrl(fallbackImageData.imageUrl)) {
      imageUrl = fallbackImageData.imageUrl;
      console.log(`[DataAccess/OpenGraph] Using Karakeep imageUrl fallback: ${imageUrl}`);
      
      // Schedule S3 persistence for Karakeep image
      scheduleImagePersistence(imageUrl, OPENGRAPH_IMAGES_S3_DIR, 'Karakeep-Fallback', undefined, url);
    }
    // Try Karakeep imageAssetId (second priority)
    else if (fallbackImageData.imageAssetId) {
      try {
        imageUrl = constructKarakeepAssetUrl(fallbackImageData.imageAssetId);
        console.log(`[DataAccess/OpenGraph] Using Karakeep imageAssetId fallback: ${imageUrl}`);
        
        // Schedule S3 persistence for Karakeep asset
        scheduleImagePersistence(imageUrl, OPENGRAPH_IMAGES_S3_DIR, 'Karakeep-Asset-Fallback', fallbackImageData.imageAssetId, url);
      } catch (error) {
        console.warn(`[DataAccess/OpenGraph] Failed to construct Karakeep asset URL for ${fallbackImageData.imageAssetId}:`, error);
      }
    }
    // Try Karakeep screenshotAssetId (third priority)
    else if (fallbackImageData.screenshotAssetId) {
      try {
        imageUrl = constructKarakeepAssetUrl(fallbackImageData.screenshotAssetId);
        console.log(`[DataAccess/OpenGraph] Using Karakeep screenshotAssetId fallback: ${imageUrl}`);
        
        // Schedule S3 persistence for Karakeep screenshot
        scheduleImagePersistence(imageUrl, OPENGRAPH_IMAGES_S3_DIR, 'Karakeep-Screenshot-Fallback', fallbackImageData.screenshotAssetId, url);
      } catch (error) {
        console.warn(`[DataAccess/OpenGraph] Failed to construct Karakeep screenshot URL for ${fallbackImageData.screenshotAssetId}:`, error);
      }
    }
  }

  // Fall back to domain-specific defaults if no Karakeep data available
  if (!imageUrl) {
    imageUrl = getFallbackImageForDomain(domain);
  }
  
  return {
    imageUrl,
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
 * Reuses existing fallback logic pattern from og-image route
 */
function getFallbackImageForDomain(domain: string): string | null {
  // Use same fallback logic as og-image/route.ts getLocalImageForSocialNetwork
  switch (domain) {
    case 'GitHub':
      return process.env.FALLBACK_IMAGE_GITHUB || 'https://avatars.githubusercontent.com/u/99231285?v=4';
    case 'X':
    case 'Twitter':
      return process.env.FALLBACK_IMAGE_X || 'https://pbs.twimg.com/profile_images/1515007138717503494/KUQNKo_M_400x400.jpg';
    case 'LinkedIn':
      return process.env.FALLBACK_IMAGE_LINKEDIN || 'https://media.licdn.com/dms/image/C5603AQGjv8C3WhrUfQ/profile-displayphoto-shrink_800_800/0/1651775977276';
    case 'Discord':
      return process.env.FALLBACK_IMAGE_DISCORD || '/images/william.jpeg';
    case 'Bluesky':
      return process.env.FALLBACK_IMAGE_BLUESKY || 'https://cdn.bsky.app/img/avatar/plain/did:plc:o3rar2atqxlmczkaf6npbcqz/bafkreidpq75jyggvzlm5ddgpzhfkm4vprgitpxukqpgkrwr6sqx54b2oka@jpeg';
    default:
      return process.env.FALLBACK_IMAGE_DEFAULT || '/images/william.jpeg';
  }
}

/**
 * Gets fallback banner image for a domain
 * Reuses existing fallback logic pattern from og-image route
 */
function getFallbackBannerForDomain(domain: string): string | null {
  // Use same fallback logic as og-image/route.ts getDomainBrandingImage
  switch (domain) {
    case 'GitHub':
      return '/images/social-banners/github.svg';
    case 'X':
    case 'Twitter':
      return '/images/social-banners/twitter-x.svg';
    case 'LinkedIn':
      return '/images/social-banners/linkedin.svg';
    case 'Discord':
      return '/images/social-banners/discord.svg';
    case 'Bluesky':
      return '/images/social-banners/bluesky.png';
    default:
      return null;
  }
}

/**
 * Serves a persisted OpenGraph image from S3 persistent storage
 *
 * @param s3Key - S3 key for the persisted image
 * @returns Promise resolving to image buffer and content type, or null if not found
 */
export async function serveOpenGraphImage(s3Key: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  return serveImageFromS3(s3Key, 'OpenGraph');
}
