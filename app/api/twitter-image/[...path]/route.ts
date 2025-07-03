import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getUnifiedImageService } from "@/lib/services/unified-image-service";
import type { TwitterImageContext } from "@/types";
import { sanitizePath, IMAGE_SECURITY_HEADERS } from "@/lib/validators/url";

export async function GET(request: NextRequest, { params }: TwitterImageContext) {
  try {
    // Reconstruct the Twitter image URL from dynamic params
    const { path: pathSegments } = params;

    // Sanitize path to prevent directory traversal
    const fullPath = sanitizePath(pathSegments.join("/"));
    
    // Extract embedded query parameters from the fullPath
    let pathOnly = fullPath;
    let embeddedSearch = "";
    if (fullPath.includes("?")) {
      const [rawPath, ...rest] = fullPath.split("?");
      pathOnly = rawPath ?? "";
      embeddedSearch = `?${rest.join("?")}`;
    }

    // Validate Twitter image path patterns to prevent SSRF attacks
    // Updated pattern to disallow dots except in file extensions
    const validPathPattern = /^(profile_images|ext_tw_video_thumb|media)\/[\w\-/]+\.(jpg|jpeg|png|gif|webp)$/i;
    if (!validPathPattern.test(pathOnly)) {
      console.log(`[Twitter Image Proxy] Invalid path rejected: ${fullPath}`);
      return new NextResponse(null, { status: 400 });
    }

    // Preserve any query parameters (e.g., format, name)
    const { search } = request.nextUrl;
    // Use embeddedSearch as fallback for query parameters embedded in the path
    const upstreamUrl = `https://pbs.twimg.com/${pathOnly}${search || embeddedSearch}`;
    console.log(`[Twitter Image Proxy] Attempting to fetch: ${upstreamUrl}`);

    // Use UnifiedImageService for consistent image handling
    const imageService = getUnifiedImageService();
    
    // Categorize Twitter images for proper S3 organization
    const options: Parameters<typeof imageService.getImage>[1] = {};
    if (pathOnly.startsWith("profile_images/")) {
      options.type = "social-avatars/twitter";
    } else if (pathOnly.startsWith("media/") || pathOnly.startsWith("ext_tw_video_thumb/")) {
      options.type = "twitter-media";
    }
    
    const result = await imageService.getImage(upstreamUrl, options);

    // If we got a CDN URL, redirect to it
    if (result.cdnUrl && !result.buffer) {
      return NextResponse.redirect(result.cdnUrl, { status: 302 });
    }

    // If we have a buffer, return it
    if (result.buffer) {
      const responseHeaders = new Headers({
        "Content-Type": result.contentType,
        // Enhanced caching: 24 hours with stale-while-revalidate for better performance
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800, immutable",
        "X-Cache": result.source === "memory" ? "HIT" : "MISS",
        "X-Source": result.source,
        ...IMAGE_SECURITY_HEADERS,
      });

      return new NextResponse(result.buffer, { headers: responseHeaders });
    }

    // If we have an error, return appropriate status
    if (result.error) {
      console.error(`[Twitter Image Proxy] Error: ${result.error}`);
      if (result.error.includes("timeout")) {
        return new NextResponse(null, { status: 504 }); // Gateway Timeout
      }
      return new NextResponse(null, { status: 502 }); // Bad Gateway
    }

    // Fallback error
    return new NextResponse(null, { status: 502 }); // Bad Gateway
  } catch (error) {
    console.error("[Twitter Image Proxy] Error fetching image:", error);

    // Handle timeout errors specifically
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      return new NextResponse(null, { status: 504 }); // Gateway Timeout
    }

    // Handle other errors
    return new NextResponse(null, { status: 502 }); // Bad Gateway
  }
}
