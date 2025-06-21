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
import { LRUCache } from "lru-cache";
import { s3Client } from "@/lib/s3-utils";
import { getDomainType } from "@/lib/utils/opengraph-utils";
import { getDomainFallbackImage, getContextualFallbackImage } from "@/lib/opengraph/fallback";
import { scheduleImagePersistence } from "@/lib/opengraph/persistence";
import { OPENGRAPH_IMAGES_S3_DIR } from "@/lib/opengraph/constants";
import { getOpenGraphData } from "@/lib/data-access/opengraph";
import { getUnifiedImageService } from "@/lib/services/unified-image-service";
// persistImageToS3 is now handled by scheduleImagePersistence from lib/opengraph/persistence
import type { UnifiedBookmark } from "@/types";

const isDevelopment = process.env.NODE_ENV === "development";
const S3_BUCKET = process.env.S3_BUCKET;
const S3_CDN_URL = process.env.NEXT_PUBLIC_S3_CDN_URL;

// In-memory cache for S3 existence checks
const s3ExistenceCache = new LRUCache<string, boolean>({
  max: 1000, // Max 1000 items
  ttl: 5 * 60 * 1000, // 5 minutes
});

/**
 * Check if an S3 object exists
 */
async function checkS3Exists(key: string): Promise<boolean> {
  // Check cache first
  if (s3ExistenceCache.has(key)) {
    return s3ExistenceCache.get(key) ?? false;
  }

  if (!s3Client || !S3_BUCKET) {
    console.warn("[OG-Image] S3 not configured, cannot check existence");
    return false;
  }

  try {
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
      }),
    );

    // Cache positive result
    s3ExistenceCache.set(key, true);
    return true;
  } catch {
    // Cache negative result
    s3ExistenceCache.set(key, false);
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
  const input = searchParams.get("url");
  const assetId = searchParams.get("assetId");
  const bookmarkId = searchParams.get("bookmarkId");

  if (!input) {
    return new NextResponse("Missing url parameter", { status: 400 });
  }

  // Log request for debugging
  console.log(
    `[OG-Image] Processing request - URL: ${input}, AssetID: ${assetId || "none"}, BookmarkID: ${bookmarkId || "none"}`,
  );

  // 1. Check if it's an S3 key (contains '/' but no protocol)
  // Exclude /api/assets/ URLs which are internal API routes, not S3 keys
  if (input.includes("/") && !input.includes("://") && !input.startsWith("/api/")) {
    console.log(`[OG-Image] Detected S3 key: ${input}`);
    // In development we may lack S3 credentials; optimistically redirect to CDN
    if (isDevelopment || (await checkS3Exists(input))) {
      if (!S3_CDN_URL) {
        console.error("[OG-Image] S3_CDN_URL not configured; cannot redirect");
        const fallbackImage = getContextualFallbackImage(input);
        return NextResponse.redirect(new URL(fallbackImage, request.url).toString(), {
          status: 302,
        });
      }
      const cdnUrl = `${S3_CDN_URL}/${input}`;
      console.log(`[OG-Image] Redirecting to CDN: ${cdnUrl}`);
      return NextResponse.redirect(cdnUrl, { status: 301 });
    }

    console.warn(`[OG-Image] S3 object not found: ${input}`);
    const fallbackImage = getContextualFallbackImage(input);
    return NextResponse.redirect(new URL(fallbackImage, request.url).toString(), { status: 302 });
  }

  // 2. Check if it's a Karakeep asset ID (alphanumeric with dashes/underscores)
  if (/^[a-zA-Z0-9_-]+$/.test(input) && !input.includes("/")) {
    console.log(`[OG-Image] Detected Karakeep asset ID: ${input}`);

    // Always redirect to the asset URL - let the assets API handle existence checks
    const assetUrl = `/api/assets/${input}`;
    return NextResponse.redirect(new URL(assetUrl, request.url).toString(), { status: 302 });
  }

  // 3. Must be a URL - validate and process
  try {
    const url = new URL(input);
    const hostname = url.hostname.replace(/^www\./, "");

    // Development mode: allow localhost and local IPs
    if (isDevelopment) {
      const isLocalhost =
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname.endsWith(".local") ||
        /^192\.168\.|^10\.|^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname);

      if (isLocalhost) {
        console.log(`[OG-Image] [DEV] Allowing local URL: ${url.toString()}`);
      }
    } else {
      // Blocklist strategy – deny only obviously dangerous internal networks / metadata endpoints.
      const blockedHostPatterns = [
        /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/, // private networks
        /\.internal$/i,
      ];

      const isBlocked = blockedHostPatterns.some((re) => re.test(hostname));
      if (isBlocked) {
        console.warn(`[OG-Image] Blocked private/internal domain: ${hostname}`);
        return NextResponse.redirect(new URL("/images/opengraph-placeholder.png", request.url).toString(), {
          status: 302,
        });
      }
    }

    // Check if this URL looks like a direct image URL (common image extensions or image-related paths)
    const imageService = getUnifiedImageService();
    const urlPath = url.pathname.toLowerCase();
    const isLikelyImage =
      /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?|$)/i.test(urlPath) || // Common image extensions
      (url.searchParams.has("url") &&
        /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?|$)/i.test(url.searchParams.get("url") || "")) || // Proxy URLs with image extensions
      urlPath.includes("/image") ||
      urlPath.includes("/img") ||
      urlPath.includes("/photo") || // Image-related paths
      url.hostname.includes("imgur") ||
      url.hostname.includes("cloudinary") ||
      url.hostname.includes("unsplash"); // Known image hosts

    if (isLikelyImage) {
      console.log(`[OG-Image] Detected direct image URL, fetching directly: ${url.toString()}`);

      const imageResult = await imageService.getImage(url.toString(), { type: "opengraph" });

      // If we got a CDN URL, redirect to it
      if (imageResult.cdnUrl && !imageResult.buffer) {
        console.log(`[OG-Image] Found direct image in S3, redirecting to: ${imageResult.cdnUrl}`);
        return NextResponse.redirect(imageResult.cdnUrl, { status: 301 });
      }

      // If we have a buffer, return it
      if (imageResult.buffer) {
        // Persist to S3 in background
        scheduleImagePersistence(
          url.toString(),
          OPENGRAPH_IMAGES_S3_DIR,
          "OG-Image-Direct",
          bookmarkId || undefined,
          url.toString(),
        );

        return new NextResponse(imageResult.buffer, {
          headers: {
            "Content-Type": imageResult.contentType,
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Source": "direct-image",
          },
        });
      }

      // If there was an error with direct fetch, fall through to OpenGraph extraction
      if (imageResult.error) {
        console.log(`[OG-Image] Direct image fetch failed (${imageResult.error}), trying OpenGraph extraction`);
      }
    }

    // PRIORITY CHECK: If we have Karakeep banner assets, check them FIRST before OpenGraph
    let fallbackImageData: unknown;
    if (assetId || bookmarkId) {
      // If we have an assetId directly, use it
      if (assetId) {
        console.log(`[OG-Image] Checking Karakeep assetId BEFORE OpenGraph: ${assetId}`);
        const assetUrl = `/api/assets/${assetId}`;
        return NextResponse.redirect(new URL(assetUrl, request.url).toString(), { status: 302 });
      } else if (bookmarkId) {
        // If we only have bookmarkId, try to get bookmark data and check Karakeep assets first
        try {
          const { readJsonS3 } = await import("@/lib/s3-utils");
          const { BOOKMARKS_S3_PATHS } = await import("@/lib/constants");

          const bookmarksData = await readJsonS3<UnifiedBookmark[]>(BOOKMARKS_S3_PATHS.FILE);
          if (bookmarksData && Array.isArray(bookmarksData)) {
            const bookmark = bookmarksData.find((b) => b.id === bookmarkId);

            if (bookmark) {
              // PRIORITY: Karakeep bannerImage (imageAssetId) takes precedence over OpenGraph
              if (bookmark.content?.imageAssetId) {
                console.log(
                  `[OG-Priority-KARAKEEP] 🎯 Found Karakeep bannerImage (imageAssetId), using INSTEAD of OpenGraph: ${bookmark.content.imageAssetId}`,
                );
                const assetUrl = `/api/assets/${bookmark.content.imageAssetId}`;
                return NextResponse.redirect(new URL(assetUrl, request.url).toString(), { status: 302 });
              }

              fallbackImageData = {
                imageUrl: bookmark.content?.imageUrl || undefined,
                imageAssetId: bookmark.content?.imageAssetId || undefined,
                screenshotAssetId: bookmark.content?.screenshotAssetId || undefined,
              };
              console.log(
                `[OG-Image] No Karakeep bannerImage found, proceeding to OpenGraph with fallback data:`,
                fallbackImageData,
              );
            }
          }
        } catch (s3Error) {
          console.error("[OG-Image] Failed to read bookmarks for Karakeep priority check:", s3Error);
        }
      }
    }

    // Try to get from our OpenGraph data access layer (only if no Karakeep banner found)
    // This will use memory cache → S3 → external fetch
    try {
      const ogData = await getOpenGraphData(url.toString(), false, undefined, fallbackImageData);

      if (ogData.imageUrl && typeof ogData.imageUrl === "string") {
        // If it's an S3 key, redirect to CDN
        if (ogData.imageUrl.includes("/") && !ogData.imageUrl.includes("://")) {
          const cdnUrl = imageService.getCdnUrl(ogData.imageUrl);
          console.log(`[OG-Image] Found OG image in cache, redirecting to: ${cdnUrl}`);
          return NextResponse.redirect(cdnUrl, { status: 301 });
        }

        // If it's an external URL, fetch using UnifiedImageService
        console.log(`[OG-Image] Fetching external OG image: ${ogData.imageUrl}`);

        const imageResult = await imageService.getImage(ogData.imageUrl, { type: "opengraph" });

        // If we got a CDN URL, redirect to it
        if (imageResult.cdnUrl && !imageResult.buffer) {
          console.log(`[OG-Image] Found OG image in S3, redirecting to: ${imageResult.cdnUrl}`);
          return NextResponse.redirect(imageResult.cdnUrl, { status: 301 });
        }

        // If we have a buffer, return it
        if (imageResult.buffer) {
          // Persist to S3 in background
          if (ogData.imageUrl && typeof ogData.imageUrl === "string") {
            scheduleImagePersistence(
              ogData.imageUrl,
              OPENGRAPH_IMAGES_S3_DIR,
              "OG-Image-Background",
              bookmarkId || undefined,
              url.toString(),
            );
          }

          return new NextResponse(imageResult.buffer, {
            headers: {
              "Content-Type": imageResult.contentType,
              "Cache-Control": "public, max-age=31536000, immutable",
              "X-Content-Source": "opengraph-cached",
            },
          });
        }

        // If there was an error, throw it to fall back to direct fetch
        if (imageResult.error) {
          throw new Error(imageResult.error);
        }
      }
    } catch (ogError) {
      console.error("[OG-Image] OpenGraph fetch failed:", ogError);
    }

    // If OpenGraph fetch failed or no image found, try direct fetch using UnifiedImageService
    // (This handles cases where the URL wasn't detected as a direct image but might still be one)
    console.log(`[OG-Image] Attempting fallback direct fetch: ${url.toString()}`);

    const imageResult = await imageService.getImage(url.toString(), { type: "opengraph" });

    // If we got a CDN URL, redirect to it
    if (imageResult.cdnUrl && !imageResult.buffer) {
      console.log(`[OG-Image] Found image in S3, redirecting to: ${imageResult.cdnUrl}`);
      return NextResponse.redirect(imageResult.cdnUrl, { status: 301 });
    }

    // If we have a buffer, return it
    if (imageResult.buffer) {
      // Persist to S3 in background
      scheduleImagePersistence(
        url.toString(),
        OPENGRAPH_IMAGES_S3_DIR,
        "OG-Image-Background",
        bookmarkId || undefined,
        url.toString(),
      );

      return new NextResponse(imageResult.buffer, {
        headers: {
          "Content-Type": imageResult.contentType,
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Content-Source": imageResult.source,
        },
      });
    }

    // If there was an error, throw it
    if (imageResult.error) {
      throw new Error(imageResult.error);
    }

    throw new Error("Failed to fetch image");
  } catch (error) {
    // Log expected errors without stack trace
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isExpectedError =
      errorMessage.includes("Not an image") ||
      errorMessage.includes("HTTP") ||
      errorMessage.includes("too large") ||
      errorMessage.includes("abort");

    if (isExpectedError) {
      console.log(`[OG-Image] Expected error for ${input}: ${errorMessage}`);
    } else {
      console.error("[OG-Image] Unexpected error processing URL:", error);
    }

    // FAILURE LEVELS - All 8 priority levels failed, moving to failures
    console.log(`[OG-FAILURE] 🚨 ALL PRIORITY LEVELS FAILED for: ${input} - ${errorMessage}`);
    console.log(`[OG-FAILURE] 📉 Moving to failure fallback chain (logos/placeholders)`);

    // Try domain-specific fallback first
    const domainType = getDomainType(input);
    console.log(`[OG-FAILURE-9] 🔍 Checking domain-specific image fallback for: ${domainType}`);
    let fallbackImage = getDomainFallbackImage(domainType);

    // If no domain-specific fallback, use contextual fallback
    if (fallbackImage === "/images/opengraph-placeholder.png") {
      console.log(`[OG-FAILURE-9] ❌ No domain-specific fallback, using contextual fallback`);
      fallbackImage = getContextualFallbackImage(input, errorMessage);
    } else {
      console.log(`[OG-FAILURE-9] ✅ Using domain-specific fallback: ${fallbackImage}`);
    }

    console.log(`[OG-FAILURE-FINAL] 🔴 RETURNING FALLBACK IMAGE for ${domainType}: ${fallbackImage}`);

    // Ensure the fallback redirect always works by using absolute URL construction
    const fallbackUrl = new URL(fallbackImage, request.url);

    // Add a final safety net - if somehow the fallback URL construction fails,
    // provide a guaranteed base64 image to prevent broken image displays
    try {
      return NextResponse.redirect(fallbackUrl.toString(), { status: 302 });
    } catch (redirectError) {
      console.error("[OG-Image] Fallback redirect failed, using emergency base64 image:", redirectError);

      // Emergency fallback: return a minimal base64 encoded placeholder
      const emergencyImageBase64 =
        "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0ibTIxIDEyLTQuMzktNC4zOS0yLjczIDEwLjAyTDkuODggOC44NGwtMy41MSAzLjUxTDQgMTR2NGMwIDEuMS45IDIgMiAyaDE0YzEuMSAwIDItLjkgMi0ydi0yLTZaIiBmaWxsPSIjOTQwNkY3Ii8+CjxwYXRoIGQ9Ik0xOCAySDZjLTEuMSAwLTIgLjktMiAydjEyaDJWNGgxMlYyWiIgZmlsbD0iIzk0MDZGNyIvPgo8L3N2Zz4K";

      return new NextResponse("", {
        status: 302,
        headers: {
          Location: emergencyImageBase64,
        },
      });
    }
  }
}

// Domain fallback functions are now imported from lib/opengraph/fallback.ts

// Persistence function is now imported from lib/opengraph/persistence.ts
