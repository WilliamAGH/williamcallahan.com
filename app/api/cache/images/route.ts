/**
 * Image Cache API Route
 * @module app/api/cache/images
 * @description
 * Server-side API endpoint for caching and serving optimized images.
 * Uses UnifiedImageService for consistent image handling across the application.
 */

import { unstable_noStore as noStore } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import { getUnifiedImageService } from "@/lib/services/unified-image-service";
import { openGraphUrlSchema } from "@/types/schemas/url";
import { IMAGE_SECURITY_HEADERS } from "@/lib/validators/url";

// Configure cache duration (1 year in seconds)
const CACHE_DURATION = 60 * 60 * 24 * 365;

// Valid image formats
const VALID_IMAGE_FORMATS = new Set(["jpeg", "jpg", "png", "webp", "avif", "gif"]);

/**
 * GET handler for image caching
 * @param {NextRequest} request - Incoming request
 * @returns {Promise<NextResponse>} API response with cached image
 */

export async function GET(request: NextRequest): Promise<NextResponse> {
  noStore();
  const requestUrl = new URL(request.url);
  const searchParams = requestUrl.searchParams;
  const encodedUrl = searchParams.get("url");
  if (!encodedUrl) {
    return NextResponse.json({ error: "URL parameter required" }, { status: 400 });
  }
  // Decode percent-encoded URL before validation
  let url: string;
  try {
    url = decodeURIComponent(encodedUrl);
  } catch {
    url = encodedUrl;
  }
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
    const imageService = getUnifiedImageService();

    // Use UnifiedImageService to get the image with options
    const result = await imageService.getImage(url, {
      width: imageWidth,
      format: imageFormat,
      quality: imageFormat === "webp" ? 80 : imageFormat === "avif" ? 75 : 85,
    });

    // If we got a CDN URL, redirect to it
    if (result.cdnUrl && !result.buffer) {
      return NextResponse.redirect(result.cdnUrl, { status: 302 });
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
