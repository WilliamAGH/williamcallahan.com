/**
 * Bookmarks Refresh API Route
 *
 * Provides a public API endpoint for refreshing the bookmarks cache.
 * This endpoint is rate-limited to prevent abuse.
 */
import 'server-only';

import { NextResponse } from 'next/server';
import { refreshBookmarksData } from '@/lib/bookmarks';
import { ServerCacheInstance } from '@/lib/server-cache';
// Import logo functions dynamically to avoid SSR issues
let getLogo: typeof import('@/lib/data-access/logos').getLogo;
let resetLogoSessionTracking: typeof import('@/lib/data-access/logos').resetLogoSessionTracking;

// Initialize logo functions only when needed
async function initLogoFunctions() {
  if (!getLogo || !resetLogoSessionTracking) {
    const logoModule = await import('@/lib/data-access/logos');
    getLogo = logoModule.getLogo;
    resetLogoSessionTracking = logoModule.resetLogoSessionTracking;
  }
}
import type { UnifiedBookmark } from '@/types/bookmark';

// Ensure this route is not statically cached
export const dynamic = 'force-dynamic';

// --- Utility Functions ---

/**
 * Extracts unique domains from an array of bookmark objects
 * @param bookmarks - Array of bookmark objects with url properties
 * @returns Set of unique domain names with www prefix removed
 */
function extractDomainsFromBookmarks(bookmarks: UnifiedBookmark[]): Set<string> {
  const domains = new Set<string>();
  for (const bookmark of bookmarks) {
    try {
      if (bookmark.url) {
        const url = new URL(bookmark.url);
        const domain = url.hostname.replace(/^www\./, '');
        domains.add(domain);
      }
    } catch (error) {
      // Log invalid URLs for debugging while continuing processing
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`[API Bookmarks Refresh] Invalid URL in bookmark ${bookmark.id || 'unknown'}: ${bookmark.url} (${errorMessage})`);
    }
  }
  return domains;
}

/**
 * Processes logo fetching for domains in small batches (for API context)
 * @param domains - Array of domain names to process
 * @param context - Description of the processing context for logging
 * @returns Promise resolving to success and failure counts
 */
async function processLogosBatch(
  domains: string[], 
  context: string
): Promise<{ successCount: number; failureCount: number }> {
  let successCount = 0;
  let failureCount = 0;
  const batchSize = 3; // Small batches for API context
  const delay = 100; // Short delay for API context

  for (let i = 0; i < domains.length; i += batchSize) {
    const batch = domains.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(domains.length / batchSize);
    
    console.log(`[API Bookmarks Refresh] Processing ${context} logo batch ${batchNumber}/${totalBatches} for ${batch.length} domains`);

    const promises = batch.map(async (domain) => {
      try {
        const logoResult = await getLogo(domain);
        if (logoResult?.buffer && Buffer.isBuffer(logoResult.buffer) && logoResult.buffer.length > 0) {
          console.log(`[API Bookmarks Refresh] ✅ Logo processed for ${domain} (source: ${logoResult.source})`);
          successCount++;
        } else {
          console.warn(`[API Bookmarks Refresh] ⚠️ Could not fetch/process logo for ${domain}`);
          failureCount++;
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[API Bookmarks Refresh] ❌ Error processing logo for ${domain}:`, message);
        failureCount++;
      }
    });

    await Promise.allSettled(promises);

    // Apply rate limiting delay between batches (except for the last batch)
    if (i + batchSize < domains.length) {
      console.log(`[API Bookmarks Refresh] ⏱️ Waiting ${delay}ms before next ${context} logo batch...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  return { successCount, failureCount };
}

// In-memory rate limiting
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 5; // 5 requests per window

// Simple in-memory rate limiting
// Rate limiting implementation - consider replacing with distributed solution for multi-instance deployments
// In-memory store resets on deploys and doesn't scale horizontally.
const rateLimitStore: { [ip: string]: { count: number; resetAt: number } } = {};

/**
 * Rate limiting middleware
 */
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitStore[ip];

  // If no record exists or window has expired, create a new one
  if (!record || now > record.resetAt) {
    rateLimitStore[ip] = {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW
    };
    return true;
  }

  // Increment count and check if over limit
  record.count++;
  if (record.count > RATE_LIMIT_MAX) {
    return false;
  }

  return true;
}

/**
 * POST handler - Refreshes the bookmarks cache
 */
export async function POST(request: Request): Promise<NextResponse> {
  const authorizationHeader = request.headers.get('Authorization');
  const cronRefreshSecret = process.env.BOOKMARK_CRON_REFRESH_SECRET;
  
  let isCronJob = false;

  // Check for custom secret authentication
  if (cronRefreshSecret && authorizationHeader && authorizationHeader.startsWith('Bearer ')) {
    const token = authorizationHeader.substring(7); // Remove "Bearer " prefix
    if (token === cronRefreshSecret) {
      isCronJob = true;
      console.log('[API Bookmarks Refresh] Authenticated as cron job via BOOKMARK_CRON_REFRESH_SECRET.');
    }
  }

  // Get client IP for rate limiting (only if not an authenticated cron job)
  if (!isCronJob) {
    const forwardedFor: string = request.headers.get('x-forwarded-for') || 'unknown';
    const clientIp = forwardedFor?.split(',')[0]?.trim() || '';
    if (!checkRateLimit(clientIp)) {
      return NextResponse.json({
        error: 'Rate limit exceeded. Try again later.'
      }, { status: 429 });
    }
  }

  try {
    // For cron jobs, always refresh. For others, check if refresh is needed.
    if (!isCronJob && !ServerCacheInstance.shouldRefreshBookmarks()) {
      const cached = ServerCacheInstance.getBookmarks();
      console.log('[API Bookmarks Refresh] Regular request: Cache is already up to date.');
      return NextResponse.json({
        status: 'success',
        message: 'Bookmarks cache is already up to date',
        data: {
          refreshed: false,
          bookmarksCount: cached?.bookmarks.length || 0,
          lastFetchedAt: cached?.lastFetchedAt ? new Date(cached.lastFetchedAt).toISOString() : null
        }
      });
    }

    if (isCronJob) {
      console.log('[API Bookmarks Refresh] Cron job: Forcing bookmark data refresh.');
    } else {
      console.log('[API Bookmarks Refresh] Regular request: Refreshing bookmarks data as cache is stale or needs update.');
    }

    // Initialize logo functions before using them
    await initLogoFunctions();
    
    // Reset logo session tracking to prevent conflicts with bulk processing
    resetLogoSessionTracking();
    console.log('[API Bookmarks Refresh] Logo session tracking reset for API processing.');

    // Get current cached bookmarks to compare for new additions
    const previousBookmarks = await Promise.resolve(ServerCacheInstance.getBookmarks()?.bookmarks || []);
    const previousCount = previousBookmarks.length;
    const previousBookmarkIds = new Set(previousBookmarks.map(b => b.id));

    console.log(`[API Bookmarks Refresh] Previous cached bookmarks count: ${previousCount}`);

    const bookmarks = await refreshBookmarksData();
    
    // Process logos for new bookmarks immediately
    if (bookmarks && bookmarks.length > 0) {
      const newBookmarks = bookmarks.filter(b => !previousBookmarkIds.has(b.id));
      
      if (newBookmarks.length > 0) {
        console.log(`[API Bookmarks Refresh] Found ${newBookmarks.length} new bookmarks. Processing logos immediately.`);
        
        // Extract domains from new bookmarks only
        const newDomains = extractDomainsFromBookmarks(newBookmarks);
        
        if (newDomains.size > 0) {
          console.log(`[API Bookmarks Refresh] Processing logos for ${newDomains.size} new domains.`);
          
          try {
            // Process new domains with small batches appropriate for API context
            const { successCount, failureCount } = await processLogosBatch(
              Array.from(newDomains),
              'new bookmarks (API refresh)'
            );
            
            console.log(`[API Bookmarks Refresh] ✅ Logo processing complete: ${successCount} succeeded, ${failureCount} failed for new bookmarks.`);
          } catch (logoError) {
            console.error('[API Bookmarks Refresh] Error during logo processing:', logoError);
            // Continue with bookmark refresh even if logo processing fails
          }
        }
      } else {
        console.log('[API Bookmarks Refresh] No new bookmarks detected. Skipping logo processing.');
      }
    }

    return NextResponse.json({
      status: 'success',
      message: `Bookmarks cache refreshed successfully${isCronJob ? ' (triggered by cron job)' : ''}`,
      data: {
        refreshed: true,
        bookmarksCount: bookmarks.length,
        newBookmarksProcessed: bookmarks ? bookmarks.filter(b => !previousBookmarkIds.has(b.id)).length : 0
      }
    });
  } catch (error) {
    console.error('Failed to refresh bookmarks cache:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Failed to refresh bookmarks cache',
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

/**
 * GET handler - Check if refresh is needed
 */
export async function GET(): Promise<NextResponse> {
  // Use Promise.resolve to satisfy require-await rule
  const cached = await Promise.resolve(ServerCacheInstance.getBookmarks());
  const needsRefresh = await Promise.resolve(ServerCacheInstance.shouldRefreshBookmarks());

  return NextResponse.json({
    status: 'success',
    data: {
      needsRefresh,
      bookmarksCount: cached?.bookmarks.length || 0,
      lastFetchedAt: cached?.lastFetchedAt ? new Date(cached.lastFetchedAt).toISOString() : null,
      lastAttemptedAt: cached?.lastAttemptedAt ? new Date(cached.lastAttemptedAt).toISOString() : null
    }
  });
}
