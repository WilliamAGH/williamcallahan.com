import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Context for the dynamic route, containing the path parameter for Twitter images
 */
interface TwitterImageContext {
  // Dynamic API context params are asynchronous in Next.js 15
  params: Promise<{ path: string[] }>;
}

/**
 * Implements exponential backoff retry mechanism for fetch requests
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // If response is OK or client error (4xx), don't retry
      if (
        response.ok ||
        (response.status >= 400 && response.status < 500 && response.status !== 429)
      ) {
        return response;
      }

      // Retry on 429 (rate limit) or 5xx server errors
      if (response.status === 429 || response.status >= 500) {
        if (attempt === maxRetries) {
          return response; // Return the error response on final attempt
        }

        // Exponential backoff: 1s, 2s, 4s
        const delay = 2 ** attempt * 1000;
        console.log(
          `[Twitter Image Proxy] Retrying ${url} in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries) {
        throw lastError;
      }

      // Exponential backoff for network errors
      const delay = 2 ** attempt * 1000;
      console.log(
        `[Twitter Image Proxy] Network error, retrying ${url} in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1}):`,
        error,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error("Max retries reached");
}

export async function GET(request: NextRequest, { params }: TwitterImageContext) {
  try {
    // Reconstruct the Twitter image URL by awaiting dynamic params
    const { path: pathSegments } = await params;

    // Validate Twitter image path patterns to prevent SSRF attacks
    const validPathPattern = /^(profile_images|ext_tw_video_thumb|media)\/[\w\-/.]+$/;
    const fullPath = pathSegments.join("/");

    // Extract embedded query parameters from the fullPath
    let pathOnly = fullPath;
    let embeddedSearch = "";
    if (fullPath.includes("?")) {
      const [rawPath, ...rest] = fullPath.split("?");
      pathOnly = rawPath;
      embeddedSearch = `?${rest.join("?")}`;
    }

    // Validate Twitter image path patterns to prevent SSRF attacks (use pathOnly)
    if (!validPathPattern.test(pathOnly)) {
      console.log(`[Twitter Image Proxy] Invalid path rejected: ${fullPath}`);
      return new NextResponse(null, { status: 400 });
    }

    // Preserve any query parameters (e.g., format, name)
    const { search } = request.nextUrl;
    // Use embeddedSearch as fallback for query parameters embedded in the path
    const upstreamUrl = `https://pbs.twimg.com/${pathOnly}${search || embeddedSearch}`;
    console.log(`[Twitter Image Proxy] Attempting to fetch: ${upstreamUrl}`);

    // Fetch from Twitter with timeout, retry mechanism, and proper headers
    const upstreamResponse = await fetchWithRetry(upstreamUrl, {
      signal: AbortSignal.timeout(10000), // 10 second timeout
      headers: {
        "User-Agent": "TwitterImageProxy/1.0",
      },
    });

    console.log(
      `[Twitter Image Proxy] Upstream response status for ${upstreamUrl}: ${upstreamResponse.status} ${upstreamResponse.statusText}`,
    );

    if (!upstreamResponse.ok) {
      return new NextResponse(null, { status: upstreamResponse.status });
    }

    // Mirror content type and set caching headers for better performance
    const contentType = upstreamResponse.headers.get("Content-Type") || "application/octet-stream";
    const responseHeaders = new Headers({
      "Content-Type": contentType,
      // Enhanced caching: 24 hours with stale-while-revalidate for better performance
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800, immutable",
    });

    // Mirror status and headers (omit only content-length to allow streaming)
    upstreamResponse.headers.forEach((value, key) => {
      // Omit content-length since streaming chunk size may differ, but preserve content-encoding
      if (key.toLowerCase() === "content-length") return;
      responseHeaders.set(key, value);
    });

    // Stream the image data back
    return new NextResponse(upstreamResponse.body, { headers: responseHeaders });
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
