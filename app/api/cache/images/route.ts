/**
 * Image Cache API Route
 * @module app/api/cache/images
 * @description
 * Server-side API endpoint for caching and serving optimized images.
 * Streams CDN bytes (rather than redirecting) so Next.js 16's image optimizer
 * always receives a 200 response from our `/api` proxy, which aligns with the
 * official contract in https://nextjs.org/docs/app/building-your-application/optimizing/images.
 * Uses UnifiedImageService for consistent image handling across the application.
 */

import { unstable_noStore as noStore } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import { getUnifiedImageService } from "@/lib/services/unified-image-service";
import { openGraphUrlSchema } from "@/types/schemas/url";
import { IMAGE_SECURITY_HEADERS } from "@/lib/validators/url";
import { getCdnConfigFromEnv, isOurCdnUrl } from "@/lib/utils/cdn-utils";

// Configure cache duration (1 year in seconds)
const CACHE_DURATION = 60 * 60 * 24 * 365;

// Valid image formats
const VALID_IMAGE_FORMATS = new Set(["jpeg", "jpg", "png", "webp", "avif", "gif"]);
const CDN_CONFIG = getCdnConfigFromEnv();

/**
 * GET handler for image caching
 * @param {NextRequest} request - Incoming request
 * @returns {Promise<NextResponse>} API response with cached image
 */

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (typeof noStore === "function") {
    noStore();
  }
  const requestUrl = new URL(request.url);
  const searchParams = requestUrl.searchParams;
  const encodedUrl = searchParams.get("url");
  if (!encodedUrl) {
    return NextResponse.json({ error: "URL parameter required" }, { status: 400 });
  }
  const url = decodeNestedUrl(encodedUrl);
  const width = searchParams.get("width");
  const format = searchParams.get("format") || "webp";

  // SECURITY: Validate URL to prevent SSRF attacks
  const urlValidation = openGraphUrlSchema.safeParse(url);
  if (!urlValidation.success) {
    return NextResponse.json(
      { error: "Invalid or unsafe URL", details: urlValidation.error.errors[0]?.message },
      { status: 403 },
    );
  }

  // Validate and sanitize width
  const parsedWidth = width ? Number.parseInt(width, 10) : 0;
  const imageWidth = !Number.isNaN(parsedWidth) && parsedWidth > 0 ? parsedWidth : 1920;

  // Validate format
  const imageFormat = VALID_IMAGE_FORMATS.has(format)
    ? (format as "jpeg" | "jpg" | "png" | "webp" | "avif" | "gif")
    : ("webp" as "jpeg" | "jpg" | "png" | "webp" | "avif" | "gif");

  try {
    if (isOurCdnUrl(url, CDN_CONFIG)) {
      const upstream = await fetch(url);
      if (!upstream.ok || !upstream.body) {
        return new NextResponse(null, {
          status: upstream.status === 200 ? 502 : upstream.status,
        });
      }

      const passthroughHeaders = new Headers({
        "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
        "Cache-Control": `public, max-age=${CACHE_DURATION}, immutable`,
        ...IMAGE_SECURITY_HEADERS,
      });

      return new NextResponse(upstream.body, {
        status: 200,
        headers: passthroughHeaders,
      });
    }

    const imageService = getUnifiedImageService();

    // Use UnifiedImageService to get the image with options
    const result = await imageService.getImage(url, {
      width: imageWidth,
      format: imageFormat,
      quality: imageFormat === "webp" ? 80 : imageFormat === "avif" ? 75 : 85,
    });

    // If we got a CDN URL, stream bytes directly so Next.js optimizer receives a 200 response
    if (result.cdnUrl && !result.buffer) {
      try {
        const upstream = await fetch(result.cdnUrl);
        if (!upstream.ok || !upstream.body) {
          return NextResponse.json(
            { error: "Failed to fetch cached image", status: upstream.status },
            { status: upstream.status === 200 ? 502 : upstream.status || 502 },
          );
        }

        const passthroughHeaders = new Headers({
          "Content-Type": upstream.headers.get("content-type") ?? result.contentType ?? "application/octet-stream",
          "Cache-Control": upstream.headers.get("cache-control") ?? `public, max-age=${CACHE_DURATION}, immutable`,
          "X-Source": "cdn",
          ...IMAGE_SECURITY_HEADERS,
        });

        return new NextResponse(upstream.body, {
          status: 200,
          headers: passthroughHeaders,
        });
      } catch (cdnError) {
        console.error("Image cache CDN fetch error:", cdnError);
        return NextResponse.json({ error: "Failed to fetch cached image" }, { status: 502 });
      }
    }

    // If we have a buffer, return it
    if (result.buffer) {
      return new NextResponse(new Uint8Array(result.buffer), {
        headers: {
          "Content-Type": result.contentType,
          "Cache-Control": `public, max-age=${CACHE_DURATION}, immutable`,
          "X-Cache": result.source === "memory" ? "HIT" : "MISS",
          "X-Source": result.source,
          ...IMAGE_SECURITY_HEADERS,
        },
      });
    }

    // If we have an error, return it
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    // Fallback error
    return NextResponse.json({ error: "Failed to process image" }, { status: 500 });
  } catch (error) {
    console.error("Image cache error:", error);
    return NextResponse.json({ error: "Failed to process image" }, { status: 500 });
  }
}

/**
 * Decode a URL string that may have been encoded multiple times.
 * Next.js Image optimizer re-encodes the entire query string when proxying through /_next/image,
 * so `/api/cache/images?url=...` arrives double-encoded. We gently decode up to five times until
 * the value stabilizes or no percent sequences remain.
 */
function decodeNestedUrl(value: string, maxPasses = 5): string {
  let result = value;

  for (let i = 0; i < maxPasses; i += 1) {
    if (!result.includes("%")) {
      break;
    }

    let decoded: string;
    try {
      decoded = decodeURIComponent(result);
    } catch {
      break;
    }

    if (decoded === result) {
      break;
    }

    result = decoded;
  }

  return result;
}
