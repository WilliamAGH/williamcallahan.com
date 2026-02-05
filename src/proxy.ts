/**
 * Proxy for handling request logging, security headers, and authentication (Next.js 16)
 * @module proxy
 * @description
 * Handles Clerk authentication, request logging, and security headers for all non-static routes.
 * Applies security headers and caching headers for static assets and analytics scripts.
 * Protected routes (/admin/*, /api/admin/*) require authentication when Clerk is configured.
 * Note: Renamed from middleware.ts to proxy.ts in Next.js 16
 *
 * @see https://clerk.com/docs/references/nextjs/clerk-middleware
 */

// Runtime configuration for middleware (Edge)
// Next.js v15+ expects runtime to be specified within the exported `config` object.
// See: https://github.com/vercel/next.js/blob/canary/docs/01-app/03-api-reference/03-file-conventions/middleware.mdx
// Using `edge` here (not deprecated `experimental-edge`).

import { CSP_DIRECTIVES } from "@/config/csp";
import { NextResponse, type NextRequest, type NextMiddleware } from "next/server";
import { memoryPressureMiddleware } from "@/lib/middleware/memory-pressure";
import { sitewideRateLimitMiddleware } from "@/lib/middleware/sitewide-rate-limit";
import { getClientIp } from "@/lib/utils/request-utils";
import type { ClerkMiddlewareAuth } from "@clerk/nextjs/server";

/**
 * Check if Clerk is configured (publishable key available)
 * This must be checked before importing Clerk modules to avoid runtime errors
 */
const isClerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

import type { RequestLog } from "@/types/lib";

/**
 * Dynamically imports Content Security Policy (CSP) hashes from the auto-generated file.
 *
 * The csp-hashes.json file is created post-build by scripts/generate-csp-hashes.ts
 * and contains SHA256 hashes of all inline scripts and styles found in the Next.js
 * build output. These hashes enable a strict CSP policy without using 'unsafe-inline'.
 *
 * @returns {Promise<{scriptSrc: string[], styleSrc: string[]}>} Object containing arrays of CSP hash strings
 *          - scriptSrc: Array of SHA256 hashes for inline scripts (e.g., "'sha256-abc123...'")
 *          - styleSrc: Array of SHA256 hashes for inline styles
 *
 * @example
 * const hashes = await getCspHashes();
 * // Returns: { scriptSrc: ["'sha256-...'", "'sha256-...'"], styleSrc: ["'sha256-...'"] }
 *
 * @note The file may not exist during the first build, which is expected behavior.
 *       In this case, empty arrays are returned for both scriptSrc and styleSrc.
 */
// Fallback when CSP hashes unavailable (first build, missing file). CSP still enforced via 'unsafe-inline'.
const CSP_HASHES_FALLBACK = { scriptSrc: [] as string[], styleSrc: [] as string[] } as const;

async function getCspHashes(): Promise<{ scriptSrc: string[]; styleSrc: string[] }> {
  try {
    const hashes = await import("../generated/csp-hashes.json");
    return hashes.default;
  } catch (error) {
    // [RC1] Logged fallback: CSP still works via 'unsafe-inline', hashes are an enhancement
    console.warn("[CSP] Using fallback (no hashes). Expected on first build:", error);
    return CSP_HASHES_FALLBACK;
  }
}

const NON_LOGGED_PATHS = new Set(["/favicon.ico", "/robots.txt", "/sitemap.xml"]);
const NON_LOGGED_PREFIXES = ["/_next/", "/api/"] as const;

function shouldLogRequest(pathname: string, method: string): boolean {
  if (method !== "GET") return false;
  if (NON_LOGGED_PATHS.has(pathname)) return false;
  if (NON_LOGGED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return false;
  return pathname === "/" || !pathname.includes(".");
}

/**
 * Internal proxy handler for request logging and security headers.
 * This function is wrapped by clerkMiddleware for authentication.
 * Runs on all non-static routes as defined in the matcher.
 * @param request - The incoming Nextjs request
 * @returns The modified response with added headers
 */
async function proxyHandler(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Check memory pressure first (before any expensive operations)
  const memoryResponse = await memoryPressureMiddleware(request);
  const systemStatus = memoryResponse?.headers.get("X-System-Status");
  if (memoryResponse && memoryResponse.status >= 400) return memoryResponse;
  const rateLimitResponse = sitewideRateLimitMiddleware(request);
  if (rateLimitResponse) return rateLimitResponse;
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
  if (systemStatus) response.headers.set("X-System-Status", systemStatus);
  const ip = getClientIp(request.headers);

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

  // Build and set Content-Security-Policy using build-time hashes
  // The csp-hashes.json file contains SHA256 hashes of all inline scripts/styles from the build output
  const cspHashes = await getCspHashes();

  // Merging script hashes with 'unsafe-inline' causes browsers to ignore 'unsafe-inline' and block
  // any inline scripts that do not have a matching hash (e.g., React server components bootstrap
  // scripts rendered at runtime). To prevent unexpected CSP violations, we **only** merge style
  // hashes. Script hashes are deliberately omitted so that the `'unsafe-inline'` fallback remains
  // effective for all inline scripts generated at request-time by Next.js.
  const scriptSrc = [...CSP_DIRECTIVES.scriptSrc];
  const styleSrc = [...CSP_DIRECTIVES.styleSrc, ...cspHashes.styleSrc];

  const cspDirectives: typeof CSP_DIRECTIVES = {
    ...CSP_DIRECTIVES,
    scriptSrc,
    styleSrc,
  };

  const csp = Object.entries(cspDirectives)
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
      // HTML (SSR / SSG) pages – absolutely never cache at CDN level.
      // This guarantees that when we deploy a new version, Cloudflare will
      // always fetch the fresh HTML which references the new hashed assets.
      const noStoreValue = "no-store, no-cache, must-revalidate, proxy-revalidate";
      response.headers.set("Cache-Control", noStoreValue);
      // Explicitly instruct Cloudflare (and any CDN that understands the same
      // header) to respect the no-store directive.
      response.headers.set("CDN-Cache-Control", noStoreValue);
      response.headers.set("Cloudflare-CDN-Cache-Control", noStoreValue);

      // Tag the response with both the semantic app version and the commit hash
      // so our CDN can surgically purge HTML on every deploy. Previously this
      // only used the app version, which changes infrequently and allowed stale
      // HTML to reference non-existent chunk paths after a deploy.
      const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
      const gitHash = process.env.NEXT_PUBLIC_GIT_HASH ?? "unknown-hash";
      // Cloudflare supports comma-separated tags in the Cache-Tag header.
      response.headers.set("Cache-Tag", `html-v${appVersion}, commit-${gitHash}`);
    }
  } else {
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
  }

  if (shouldLogRequest(pathname, request.method)) {
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
  }

  return response;
}

/**
 * Create the proxy handler - conditionally wraps with Clerk if configured.
 * When Clerk is not configured, protected routes are accessible without auth.
 */
async function createProxy(): Promise<NextMiddleware> {
  if (!isClerkConfigured) {
    // No Clerk - just run the proxy handler directly (wrap to match NextMiddleware signature)
    return (request: NextRequest) => proxyHandler(request);
  }

  // Clerk is configured - dynamically import and wrap with auth
  const { clerkMiddleware, createRouteMatcher } = await import("@clerk/nextjs/server");

  const isProtectedRoute = createRouteMatcher([
    "/admin(.*)",
    "/api/admin(.*)",
    // TODO: Re-enable after local testing concludes
    // "/api/books/upload",
    // "/api/books/ingest",
    // "/upload-file(.*)",
    // "/api/upload(.*)",
  ]);

  return clerkMiddleware(
    async (auth: ClerkMiddlewareAuth, request: NextRequest) => {
      // Check auth for protected routes first (before expensive CSP/caching operations)
      if (isProtectedRoute(request)) {
        await auth.protect();
      }

      // Run existing proxy logic (security headers, CSP, caching, logging)
      return proxyHandler(request);
    },
    {
      signInUrl: "/sign-in",
    },
  );
}

// Lazy singleton with race-safe initialization
let proxyInstance: NextMiddleware | null = null;
let proxyInitPromise: Promise<NextMiddleware> | null = null;

/** Main proxy export. Lazy-initializes Clerk middleware on first request. */
async function proxy(request: NextRequest): Promise<NextResponse> {
  if (!proxyInstance) proxyInstance = await (proxyInitPromise ??= createProxy());
  const result = await proxyInstance(request, {} as Parameters<NextMiddleware>[1]);
  if (!result) return NextResponse.next();
  return result instanceof NextResponse
    ? result
    : new NextResponse(result.body, {
        status: result.status,
        statusText: result.statusText,
        headers: result.headers,
      });
}

/**
 * Route matcher configuration
 * Includes image optimization routes and API routes for Clerk authentication.
 * Excludes static files from proxy processing.
 */
// Export both named and default exports for Next.js 16 proxy compatibility
export { proxy };
export default proxy;

export const config = {
  // Note: Edge runtime is NOT supported in proxy.ts in Next.js 16
  // Using nodejs runtime (which is the default and only option for proxy)
  // runtime: "nodejs", // This is implicit and cannot be configured
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - favicon.ico (favicon file)
     * - robots.txt
     * - sitemap.xml
     * - api/upload (file uploads - must bypass proxy to preserve request body)
     * But include:
     * - api routes (for Clerk auth and other APIs)
     * - api/debug (for security checks)
     * - _next/image (image optimization files)
     * - all other paths
     */
    "/((?!_next/static|favicon.ico|robots.txt|sitemap.xml|api/upload|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api(?!/upload)|trpc)(.*)",
    "/_next/image(.*)",
  ],
};
