import { NextResponse, type NextRequest } from "next/server";
import { getUnifiedImageService } from "@/lib/services/unified-image-service";
// Prefer explicit async params typing to avoid thenable duck-typing
import { sanitizePath, IMAGE_SECURITY_HEADERS } from "@/lib/validators/url";

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    // Reconstruct the Twitter image URL from dynamic params
    const { path: pathSegments } = await params;

    // Decode any percent-encoding from client and sanitize to prevent traversal
    // Client now sends path segments (not a single encoded string), but be defensive.
    const decodedJoined = decodeURIComponent(pathSegments.join("/"));
    const fullPath = sanitizePath(decodedJoined);

    // Extract embedded query parameters from the fullPath
    let pathOnly = fullPath;
    let embeddedSearch = "";
    if (fullPath.includes("?")) {
      const [rawPath, ...rest] = fullPath.split("?");
      pathOnly = rawPath ?? "";
      embeddedSearch = `?${rest.join("?")}`;
    }

    // Validate Twitter image path patterns to prevent SSRF attacks
    // Allow common avatar/media roots; keep strict filename extension check
    const validPathPattern = /^(profile_images|ext_tw_video_thumb|media)\/[A-Za-z0-9_\-/]+\.(jpg|jpeg|png|gif|webp)$/i;
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
      return NextResponse.redirect(result.cdnUrl, {
        status: 302,
        headers: {
          "Cache-Control": "public, max-age=86400", // 24h
        },
      });
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

      return new NextResponse(new Uint8Array(result.buffer), { headers: responseHeaders });
    }

    // If we have an error, attempt a direct fetch as a last-resort fallback (belt-and-suspenders)
    if (result.error) {
      console.error(`[Twitter Image Proxy] Error: ${result.error}`);
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const upstreamResp = await fetch(upstreamUrl, { signal: controller.signal });
        clearTimeout(timeout);
        if (!upstreamResp.ok) {
          if (result.error.includes("timeout")) return new NextResponse(null, { status: 504 });
          return new NextResponse(null, { status: 502 });
        }
        const contentType = upstreamResp.headers.get("content-type") || "application/octet-stream";
        if (!contentType.startsWith("image/")) return new NextResponse(null, { status: 502 });
        const arrayBuffer = await upstreamResp.arrayBuffer();
        const responseHeaders = new Headers({
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800, immutable",
          ...IMAGE_SECURITY_HEADERS,
        });
        return new NextResponse(new Uint8Array(arrayBuffer), { headers: responseHeaders });
      } catch (fallbackError) {
        console.error("[Twitter Image Proxy] Fallback fetch failed:", fallbackError);
        if (result.error.includes("timeout")) return new NextResponse(null, { status: 504 });
        return new NextResponse(null, { status: 502 });
      }
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
