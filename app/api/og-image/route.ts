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
import { getBaseUrl } from "@/lib/utils/get-base-url";
import type { UnifiedBookmark } from "@/types";

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
  const url = searchParams.get("url");
  const assetId = searchParams.get("assetId");
  const bookmarkId = searchParams.get("bookmarkId");

  // Get the correct base URL for redirects (not request.url which contains 0.0.0.0 in Docker)
  const baseUrl = getBaseUrl();

  if (!url) {
    console.warn("[OG-Image] No URL parameter provided");
    const fallbackImage = getDomainFallbackImage("unknown");
    return NextResponse.redirect(new URL(fallbackImage, baseUrl).toString(), {
      status: 302,
      headers: {
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  try {
    // Check for invalid URLs early
    if (url.startsWith("undefined") || url === "null" || url === "") {
      console.warn("[OG-Image] Invalid URL parameter:", url);
      const fallbackImage = getDomainFallbackImage("unknown");
      return NextResponse.redirect(new URL(fallbackImage, baseUrl).toString(), { status: 302 });
    }

    // Check if it's a Karakeep asset ID (36 character hex)
    if (/^[a-f0-9]{36}$/.test(url)) {
      console.log(`[OG-Image] Detected Karakeep asset ID: ${url}`);
      const assetUrl = `/api/assets/${url}`;
      return NextResponse.redirect(new URL(assetUrl, baseUrl).toString(), { status: 302 });
    }

    // More sophisticated URL validation
    try {
      new URL(url);
    } catch (urlError) {
      console.warn("[OG-Image] Invalid URL format:", url, urlError);
      const fallbackImage = getDomainFallbackImage("unknown");
      return NextResponse.redirect(new URL(fallbackImage, baseUrl).toString(), {
        status: 302,
        headers: {
          "Cache-Control": "public, max-age=86400",
        },
      });
    }

    // Check if it's an S3 key (starts with s3:// or is a simple path)
    if (url.startsWith("s3://") || (!url.startsWith("http") && !url.includes("."))) {
      console.log(`[OG-Image] Detected S3 key: ${url}`);
      const s3Key = url.startsWith("s3://") ? url.slice(5) : url;

      // Check if S3 object exists
      try {
        if (!process.env.S3_BUCKET) {
          throw new Error("S3_BUCKET not configured");
        }
        if (!s3Client) {
          throw new Error("S3 client not initialized");
        }

        await s3Client.send(
          new HeadObjectCommand({
            Bucket: process.env.S3_BUCKET,
            Key: `${OPENGRAPH_IMAGES_S3_DIR}/${s3Key}`,
          }),
        );

        // Object exists, redirect to S3 URL
        const s3Url = `${process.env.S3_CDN_URL}/${OPENGRAPH_IMAGES_S3_DIR}/${s3Key}`;
        return NextResponse.redirect(s3Url, {
          status: 302,
          headers: {
            "Cache-Control": "public, max-age=86400",
          },
        });
      } catch (s3Error) {
        console.warn(`[OG-Image] S3 object not found: ${s3Key}`, s3Error);
        const fallbackImage = getDomainFallbackImage("unknown");
        return NextResponse.redirect(new URL(fallbackImage, baseUrl).toString(), {
          status: 302,
          headers: {
            "Cache-Control": "public, max-age=86400",
          },
        });
      }
    }

    let fallbackImageData:
      | {
          imageUrl?: string;
          imageAssetId?: string;
          screenshotAssetId?: string;
        }
      | undefined;

    // NEW: Check if we have assetId or bookmarkId parameters for Karakeep priority
    if (assetId || bookmarkId) {
      // If we have an assetId directly, use it
      if (assetId) {
        console.log(`[OG-Image] Checking Karakeep assetId BEFORE OpenGraph: ${assetId}`);
        const assetUrl = `/api/assets/${assetId}`;
        return NextResponse.redirect(new URL(assetUrl, baseUrl).toString(), { status: 302 });
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
                return NextResponse.redirect(new URL(assetUrl, baseUrl).toString(), { status: 302 });
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

    // If we've reached here, proceed with OpenGraph image fetching
    const domain = getDomainType(url);
    const cacheKey = `og-image:${url}`;

    // Check memory cache first
    const cachedEntry = imageCache.get(cacheKey);
    if (cachedEntry) {
      const { imageUrl: cachedUrl, timestamp } = cachedEntry;
      const age = Date.now() - timestamp;

      if (age < CACHE_DURATION) {
        console.log(`[OG-Image] Cache hit for ${url} (age: ${Math.round(age / 1000)}s)`);
        return NextResponse.redirect(cachedUrl, {
          status: 302,
          headers: {
            "Cache-Control": "public, max-age=86400",
          },
        });
      }
    }

    // Check if S3 image exists
    let s3ImageUrl: string | null = null;
    try {
      const s3Key = `${OPENGRAPH_IMAGES_S3_DIR}/${domain}/${url.replace(/[^a-zA-Z0-9.-]/g, "_")}.webp`;
      if (!process.env.S3_BUCKET) {
        throw new Error("S3_BUCKET not configured");
      }
      if (!s3Client) {
        throw new Error("S3 client not initialized");
      }

      await s3Client.send(
        new HeadObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: s3Key,
        }),
      );

      s3ImageUrl = `${process.env.S3_CDN_URL}/${s3Key}`;
      console.log(`[OG-Image] S3 image found: ${s3ImageUrl}`);

      // Update cache
      imageCache.set(cacheKey, {
        imageUrl: s3ImageUrl,
        timestamp: Date.now(),
      });

      return NextResponse.redirect(s3ImageUrl, {
        status: 302,
        headers: {
          "Cache-Control": "public, max-age=86400",
        },
      });
    } catch {
      console.log(`[OG-Image] S3 image not found, will fetch: ${url}`);
    }

    // Fetch external image
    console.log(`[OG-Image] Fetching external image: ${url}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; OpenGraph-Image-Bot/1.0)",
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type");
      if (!contentType?.startsWith("image/")) {
        throw new Error(`Invalid content type: ${contentType}`);
      }

      const imageBuffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(imageBuffer);

      // Schedule async persistence
      scheduleImagePersistence(url, uint8Array, domain);

      // For immediate response, return the original URL
      // This avoids blocking the user while image is being processed
      return NextResponse.redirect(url, {
        status: 302,
        headers: {
          "Cache-Control": "public, max-age=3600",
        },
      });
    } catch (fetchError) {
      clearTimeout(timeout);
      console.error(`[OG-Image] Failed to fetch ${url}:`, fetchError);

      // Check for Karakeep fallback images
      if (fallbackImageData) {
        console.log("[OG-Image] Checking Karakeep fallback images...");

        // Try imageUrl first
        if (fallbackImageData.imageUrl) {
          console.log(`[OG-Image] Using Karakeep imageUrl fallback: ${fallbackImageData.imageUrl}`);
          return NextResponse.redirect(fallbackImageData.imageUrl, { status: 302 });
        }

        // Try imageAssetId
        if (fallbackImageData.imageAssetId) {
          console.log(`[OG-Image] Using Karakeep imageAssetId fallback: ${fallbackImageData.imageAssetId}`);
          const assetUrl = `/api/assets/${fallbackImageData.imageAssetId}`;
          return NextResponse.redirect(new URL(assetUrl, baseUrl).toString(), { status: 302 });
        }

        // Try screenshotAssetId
        if (fallbackImageData.screenshotAssetId) {
          console.log(`[OG-Image] Using Karakeep screenshotAssetId fallback: ${fallbackImageData.screenshotAssetId}`);
          const assetUrl = `/api/assets/${fallbackImageData.screenshotAssetId}`;
          return NextResponse.redirect(new URL(assetUrl, baseUrl).toString(), { status: 302 });
        }
      }

      // Final fallback
      const fallbackImage = getContextualFallbackImage(domain, url);
      const fallbackUrl = new URL(fallbackImage, baseUrl);
      return NextResponse.redirect(fallbackUrl.toString(), {
        status: 302,
        headers: {
          "Cache-Control": "public, max-age=86400",
        },
      });
    }
  } catch (error) {
    console.error("[OG-Image] Unexpected error:", error);
    const fallbackImage = getDomainFallbackImage("unknown");
    return NextResponse.redirect(new URL(fallbackImage, baseUrl).toString(), {
      status: 302,
      headers: {
        "Cache-Control": "public, max-age=86400",
      },
    });
  }
}

// Memory cache for recently fetched images
const imageCache = new LRUCache<string, { imageUrl: string; timestamp: number }>({
  max: 1000,
  ttl: 1000 * 60 * 60, // 1 hour
});

const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

// Domain fallback functions are now imported from lib/opengraph/fallback.ts

// Persistence function is now imported from lib/opengraph/persistence.ts
