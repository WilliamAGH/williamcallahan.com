/**
 * Universal OpenGraph Image API
 * 
 * Single source of truth for ALL OpenGraph images in the application.
 * Handles S3 keys, Karakeep asset IDs, and external URLs with comprehensive
 * fallback logic and security measures.
 * 
 * Hierarchy: Memory cache → S3 storage → External fetch → Karakeep fallback
 */

import { type NextRequest, NextResponse } from "next/server";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "@/lib/s3-utils";
import { getDomainType } from "@/lib/utils/opengraph-utils";
import { getDomainFallbackImage, getContextualFallbackImage } from "@/lib/opengraph/fallback";
import { scheduleImagePersistence } from "@/lib/opengraph/persistence";
import { OPENGRAPH_IMAGES_S3_DIR } from "@/lib/opengraph/constants";
import { getOpenGraphData } from "@/lib/data-access/opengraph";
// persistImageToS3 is now handled by scheduleImagePersistence from lib/opengraph/persistence
import type { OgResult, UnifiedBookmark } from "@/types";

const isDevelopment = process.env.NODE_ENV === 'development';
const S3_BUCKET = process.env.S3_BUCKET;
const S3_CDN_URL = process.env.NEXT_PUBLIC_S3_CDN_URL;

// In-memory cache for S3 existence checks (5 minutes TTL)
const s3ExistenceCache = new Map<string, { exists: boolean; timestamp: number }>();
const S3_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Check if an S3 object exists
 */
async function checkS3Exists(key: string): Promise<boolean> {
  // Check cache first
  const cached = s3ExistenceCache.get(key);
  if (cached && Date.now() - cached.timestamp < S3_CACHE_TTL) {
    return cached.exists;
  }

  if (!s3Client || !S3_BUCKET) {
    console.warn('[OG-Image] S3 not configured, cannot check existence');
    return false;
  }

  try {
    await s3Client.send(new HeadObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    }));
    
    // Cache positive result
    s3ExistenceCache.set(key, { exists: true, timestamp: Date.now() });
    return true;
  } catch {
    // Cache negative result
    s3ExistenceCache.set(key, { exists: false, timestamp: Date.now() });
    return false;
  }
}

/**
 * Main handler for OpenGraph image requests
 * 
 * Supported parameters:
 * - url: S3 key, external URL, or domain URL for OpenGraph fetching
 * - assetId: Karakeep asset ID (optional, provides context for better fallbacks)
 * - bookmarkId: Bookmark ID (optional, enables domain fallback for Karakeep assets)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const input = searchParams.get('url');
  const assetId = searchParams.get('assetId');
  const bookmarkId = searchParams.get('bookmarkId');
  
  if (!input) {
    return new NextResponse('Missing url parameter', { status: 400 });
  }

  // Log request for debugging
  console.log(`[OG-Image] Processing request - URL: ${input}, AssetID: ${assetId || 'none'}, BookmarkID: ${bookmarkId || 'none'}`);

  // 1. Check if it's an S3 key (contains '/' but no protocol)
  if (input.includes('/') && !input.includes('://')) {
    console.log(`[OG-Image] Detected S3 key: ${input}`);
    
    // Verify S3 object exists before redirecting
    const exists = await checkS3Exists(input);
    if (exists) {
      const cdnUrl = `${S3_CDN_URL}/${input}`;
      console.log(`[OG-Image] S3 object exists, redirecting to: ${cdnUrl}`);
      return NextResponse.redirect(cdnUrl, { status: 301 });
    }
    
    console.warn(`[OG-Image] S3 object not found: ${input}`);
    // Return contextual fallback for missing S3 objects
    const fallbackImage = getContextualFallbackImage(input);
    return NextResponse.redirect(new URL(fallbackImage, request.url).toString(), { status: 302 });
  }

  // 2. Check if it's a Karakeep asset ID (alphanumeric with dashes/underscores)
  if (/^[a-zA-Z0-9-_]+$/.test(input) && !input.includes('/')) {
    console.log(`[OG-Image] Detected Karakeep asset ID: ${input}`);
    
    // First try the direct asset
    const assetUrl = `/api/assets/${input}`;
    
    // If we have a bookmarkId, we can provide better fallbacks
    if (bookmarkId) {
      try {
        // Check if asset exists by making a HEAD request
        const assetCheck = await fetch(`${request.nextUrl.origin}${assetUrl}`, {
          method: 'HEAD',
        });
        
        if (assetCheck.ok) {
          return NextResponse.redirect(new URL(assetUrl, request.url).toString(), { status: 302 });
        }
        
        // Asset doesn't exist, try to get bookmark's domain OG image
        console.log(`[OG-Image] Karakeep asset not found, attempting domain fallback for bookmark: ${bookmarkId}`);
        
        // Read bookmarks directly from S3 to avoid triggering refresh logic
        try {
          const { readJsonS3 } = await import("@/lib/s3-utils");
          const { BOOKMARKS_S3_PATHS } = await import("@/lib/constants");
          
          const bookmarksData = await readJsonS3<UnifiedBookmark[]>(BOOKMARKS_S3_PATHS.FILE);
          if (bookmarksData && Array.isArray(bookmarksData)) {
            const bookmark = bookmarksData.find((b) => b.id === bookmarkId);
            
            if (bookmark?.url) {
              console.log(`[OG-Image] Found bookmark URL: ${bookmark.url}, fetching domain OG image`);
              // Recursively call ourselves with the bookmark URL
              const fallbackUrl = `/api/og-image?url=${encodeURIComponent(bookmark.url)}`;
              return NextResponse.redirect(new URL(fallbackUrl, request.url).toString(), { status: 302 });
            }
          }
        } catch (s3Error) {
          console.error("[OG-Image] Failed to read bookmarks from S3:", s3Error);
        }
      } catch (error) {
        console.error("[OG-Image] Error checking Karakeep asset or fetching fallback:", error);
      }
    }
    
    // No fallback available, return the asset URL anyway
    return NextResponse.redirect(new URL(assetUrl, request.url).toString(), { status: 302 });
  }

  // 3. Must be a URL - validate and process
  try {
    const url = new URL(input);
    const hostname = url.hostname.replace(/^www\./, '');
    
    // Development mode: allow localhost and local IPs
    if (isDevelopment) {
      const isLocalhost = hostname === 'localhost' || 
                         hostname === '127.0.0.1' ||
                         hostname.endsWith('.local') ||
                         /^192\.168\.|^10\.|^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname);
      
      if (isLocalhost) {
        console.log(`[OG-Image] [DEV] Allowing local URL: ${url.toString()}`);
      }
    } else {
      // Production: Use strict allowlist
      const allowedHosts = [
        // Your domains - trusted since images are validated before upload
        "williamcallahan.com",
        "s3-storage.callahan.cloud",
        "williamcallahan-com.sfo3.digitaloceanspaces.com",
        "sfo3.digitaloceanspaces.com",
        "iocloudhost.net",
        
        // Social media platforms
        "github.com",
        "x.com", 
        "twitter.com",
        "linkedin.com",
        "discord.com",
        "bsky.app",
        
        // CDN/Image domains for social platforms
        "cdn.bsky.app",
        "avatars.githubusercontent.com",
        "pbs.twimg.com", // Twitter images
        "media.licdn.com", // LinkedIn images
      ];
      
      if (!allowedHosts.includes(hostname)) {
        console.warn(`[OG-Image] Blocked non-allowlisted domain: ${hostname}`);
        return NextResponse.redirect(new URL('/images/opengraph-placeholder.png', request.url).toString(), { status: 302 });
      }
    }
    
    // Try to get from our OpenGraph data access layer first
    // This will use memory cache → S3 → external fetch
    try {
      const ogData: OgResult = await getOpenGraphData(url.toString());
      
      if (ogData.imageUrl) {
        // If it's an S3 key, redirect to CDN
        if (ogData.imageUrl.includes('/') && !ogData.imageUrl.includes('://')) {
          const cdnUrl = `${S3_CDN_URL}/${ogData.imageUrl}`;
          console.log(`[OG-Image] Found OG image in cache, redirecting to: ${cdnUrl}`);
          return NextResponse.redirect(cdnUrl, { status: 301 });
        }
        
        // If it's an external URL, fetch and stream it
        console.log(`[OG-Image] Fetching external image: ${ogData.imageUrl}`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
        
        try {
          const response = await fetch(ogData.imageUrl, { 
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; OpenGraphBot/1.0; +https://williamcallahan.com)'
            }
          });
          
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          
          // Check content type
          const contentType = response.headers.get('content-type');
          if (!contentType?.startsWith('image/')) {
            throw new Error('Not an image');
          }
          
          // Check size
          const contentLength = response.headers.get('content-length');
          if (contentLength && Number.parseInt(contentLength) > 10 * 1024 * 1024) { // 10MB limit
            throw new Error('Image too large');
          }
          
          // Clone the response so we can both stream it and save it
          const clonedResponse = response.clone();
          
          // Persist to S3 in background (using the clone)
          clonedResponse.arrayBuffer().then(() => {
            if (ogData.imageUrl) {
              scheduleImagePersistence(ogData.imageUrl, OPENGRAPH_IMAGES_S3_DIR, "OG-Image-Background", bookmarkId || undefined, url.toString());
            }
          }).catch((err: unknown) => {
            console.error('[OG-Image] Failed to clone for S3 persistence:', err);
          });
          
          // Stream the original response to client
          return new NextResponse(response.body, {
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=31536000, immutable',
              'X-Content-Source': 'opengraph-cached'
            },
          });
        } finally {
          clearTimeout(timeoutId);
        }
      }
    } catch (ogError) {
      console.error("[OG-Image] OpenGraph fetch failed:", ogError);
    }
    
    // If OpenGraph fetch failed or no image found, try direct fetch
    console.log(`[OG-Image] Attempting direct fetch: ${url.toString()}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
    
    try {
      const response = await fetch(url.toString(), { 
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; OpenGraphBot/1.0; +https://williamcallahan.com)'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      // Check content type
      const contentType = response.headers.get('content-type');
      if (!contentType?.startsWith('image/')) {
        throw new Error('Not an image');
      }
      
      // Check size
      const contentLength = response.headers.get('content-length');
      if (contentLength && Number.parseInt(contentLength) > 10 * 1024 * 1024) {
        throw new Error('Image too large');
      }
      
      // Clone the response so we can both stream it and save it
      const clonedResponse = response.clone();
      
      // Persist to S3 in background (using the clone)
      clonedResponse.arrayBuffer().then(() => {
        scheduleImagePersistence(url.toString(), OPENGRAPH_IMAGES_S3_DIR, "OG-Image-Background", bookmarkId || undefined, url.toString());
      }).catch((err: unknown) => {
        console.error('[OG-Image] Failed to clone for S3 persistence:', err);
      });
      
      // Stream the original response to client
      return new NextResponse(response.body, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000, immutable',
          'X-Content-Source': 'direct-fetch'
        },
      });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    // Log expected errors without stack trace
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isExpectedError = errorMessage.includes('Not an image') || 
                           errorMessage.includes('HTTP') || 
                           errorMessage.includes('too large') ||
                           errorMessage.includes('abort');
    
    if (isExpectedError) {
      console.log(`[OG-Image] Expected error for ${input}: ${errorMessage}`);
    } else {
      console.error("[OG-Image] Unexpected error processing URL:", error);
    }
    
    // Try domain-specific fallback first
    const domainType = getDomainType(input);
    let fallbackImage = getDomainFallbackImage(domainType);
    
    // If no domain-specific fallback, use contextual fallback
    if (fallbackImage === "/images/opengraph-placeholder.png") {
      fallbackImage = getContextualFallbackImage(input, errorMessage);
    }
    
    console.log(`[OG-Image] Returning fallback for ${domainType}: ${fallbackImage}`);
    return NextResponse.redirect(new URL(fallbackImage, request.url).toString(), { status: 302 });
  }
}

// Domain fallback functions are now imported from lib/opengraph/fallback.ts

// Persistence function is now imported from lib/opengraph/persistence.ts
