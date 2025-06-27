/**
 * Middleware for handling request logging and security headers
 * @module middleware
 * @description
 * Handles request logging and security headers for all non-static routes
 * Applies security headers and caching headers for static assets and analytics scripts
 *
 */

// Runtime configuration for middleware (Edge)
// Next.js v15+ expects runtime to be specified within the exported `config` object.
// See: https://github.com/vercel/next.js/blob/canary/docs/01-app/03-api-reference/03-file-conventions/middleware.mdx
// Using `edge` here (not deprecated `experimental-edge`).

import { CSP_DIRECTIVES } from "./lib/constants";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { memoryPressureMiddleware } from "./lib/middleware/memory-pressure";

import type { RequestLog } from "@/types/lib";

/**
 * Gets the real client IP from various headers
 * Prioritizes Cloudflare headers, then standard proxy headers
 * @param request - The Nextjs request object
 * @returns The real client IP or 'unknown'
 */
function getRealIp(request: NextRequest): string {
  return (
    request.headers.get("True-Client-IP") ||
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0] ||
    request.headers.get("X-Real-IP") ||
    "unknown"
  );
}

/**
 * Middleware to handle request logging and security headers
 * Runs on all non-static routes as defined in the matcher
 * @param request - The incoming Nextjs request
 * @returns The modified response with added headers
 */
export default async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Check memory pressure first (before any expensive operations)
  const memoryResponse = await memoryPressureMiddleware(request);
  if (memoryResponse) {
    return memoryResponse;
  }

  // SECURITY: Block debug endpoints in production
  if (pathname.startsWith("/api/debug") && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // If the request is for a .map file, let Next.js handle it directly
  // without applying our custom headers or logic.
  if (pathname.endsWith(".map")) {
    return NextResponse.next(); // Pass through without modifications
  }

  // Handle CORS preflight requests
  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-refresh-secret",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const response = NextResponse.next();
  const ip = getRealIp(request);

  // Set security and CORS headers
  const securityHeaders = {
    "X-DNS-Prefetch-Control": "on",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Frame-Options": "SAMEORIGIN",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Real-IP": ip,
    "Permissions-Policy": "geolocation=(), interest-cohort=()",
    // CORS headers
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-refresh-secret",
    "Access-Control-Max-Age": "86400",
  };

  for (const [header, value] of Object.entries(securityHeaders)) {
    response.headers.set(header, value);
  }

  // Build and set Content-Security-Policy from constants
  const csp = Object.entries(CSP_DIRECTIVES)
    .map(([key, sources]) => {
      const directive = key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
      return `${directive} ${sources.join(" ")}`;
    })
    .join("; ");
  response.headers.set("Content-Security-Policy", csp);

  // Add caching headers for static assets and analytics scripts
  const url = request.nextUrl.pathname;
  const host = request.headers.get("host") || "";
  const isDev = process.env.NODE_ENV === "development";

  // Check if the request is for an analytics script
  const isAnalyticsScript =
    url.includes("/script.js") &&
    (host.includes("umami.iocloudhost.net") || host.includes("plausible.iocloudhost.net"));

  if (isAnalyticsScript) {
    // Prevent caching for analytics scripts
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    // Add Cloudflare specific cache control
    response.headers.set("CDN-Cache-Control", "no-store, max-age=0");
    response.headers.set("Cloudflare-CDN-Cache-Control", "no-store, max-age=0");
  } else if (!isDev) {
    if (url.includes("/_next/image")) {
      response.headers.set("Cache-Control", "public, max-age=31536000, immutable");
      response.headers.set("X-Content-Type-Options", "nosniff");
      response.headers.set("Accept-CH", "DPR, Width, Viewport-Width");
    } else if (
      url.includes("/_next/static") ||
      url.endsWith(".jpg") ||
      url.endsWith(".jpeg") ||
      url.endsWith(".png") ||
      url.endsWith(".webp") ||
      url.endsWith(".avif") ||
      url.endsWith(".svg") ||
      url.endsWith(".css") ||
      url.endsWith(".woff2")
    ) {
      response.headers.set("Cache-Control", "public, max-age=31536000, immutable");
      response.headers.set("X-Content-Type-Options", "nosniff");

      if (url.match(/\.(jpe?g|png|webp|avif)$/)) {
        response.headers.set("Accept-CH", "DPR, Width, Viewport-Width");
      }
    } else if (url === "/" || !url.includes(".")) {
      // Ensure HTML pages are freshly served so analytics scripts always update
      response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    }
  } else {
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
  }

  // Log the request with the real IP
  const log: RequestLog = {
    timestamp: new Date().toISOString(),
    type: "server_pageview",
    data: {
      path: request.nextUrl.pathname,
      fullPath: request.nextUrl.pathname + request.nextUrl.search,
      method: request.method,
      clientIp: ip,
      userAgent: request.headers.get("user-agent") || "unknown",
      referer: request.headers.get("referer") || "direct",
    },
  };

  console.log(JSON.stringify(log));

  return response;
}

/**
 * Route matcher configuration
 * Includes image optimization routes and excludes other static files from middleware processing
 */
export const config = {
  runtime: "edge",
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - favicon.ico (favicon file)
     * - robots.txt
     * - sitemap.xml
     * But include:
     * - api/debug (for security checks)
     * - _next/image (image optimization files)
     * - all other paths
     */
    "/api/debug(.*)",
    "/((?!api|_next/static|favicon.ico|robots.txt|sitemap.xml).*)",
    "/_next/image(.*)",
  ],
};
