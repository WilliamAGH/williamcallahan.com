/**
 * Sitewide Rate Limiting Middleware
 *
 * Provides a lightweight, in-memory rate limit at the proxy layer to mitigate
 * aggressive crawlers that can trigger memory spikes and 503 load shedding.
 *
 * @module lib/middleware/sitewide-rate-limit
 */

import { NextResponse, type NextRequest } from "next/server";
import { isOperationAllowed } from "@/lib/rate-limiter";
import { getClientIp } from "@/lib/utils/request-utils";
import type {
  RateLimitConfig,
  RateLimitProfile,
  RateLimitProfileName,
  SitewideRateLimitOptions,
} from "@/types/middleware";
import { isHealthCheckPath } from "./health-check-paths";

const DEFAULT_STORE_PREFIX = "sitewide";

export const PROFILES: Record<RateLimitProfileName, RateLimitProfile> = {
  page: {
    // Allows normal browsing but blocks aggressive parallel crawling.
    // A single page load can trigger 20-40 requests (HTML + prefetches + RSC).
    burst: { maxRequests: 100, windowMs: 10_000 },
    minute: { maxRequests: 400, windowMs: 60_000 },
  },
  api: {
    // Keep this higher than route-level limits so specialized endpoints remain authoritative.
    burst: { maxRequests: 150, windowMs: 10_000 },
    minute: { maxRequests: 600, windowMs: 60_000 },
  },
  sentryTunnel: {
    // Sentry replay and error envelopes can burst during initial page load.
    // Use a higher ceiling without weakening general API protections.
    burst: { maxRequests: 300, windowMs: 10_000 },
    minute: { maxRequests: 1200, windowMs: 60_000 },
  },
  nextImage: {
    // Image optimization can be CPU/memory heavy; throttle bursts defensively.
    // Image-heavy pages (bookmarks, blog) can have 20+ images per page.
    burst: { maxRequests: 100, windowMs: 10_000 },
    minute: { maxRequests: 500, windowMs: 60_000 },
  },
} as const;

/**
 * Determine the rate limit profile for a given pathname.
 * Returns both the profile name and config to avoid duplicate routing logic.
 */
function getProfileForPath(pathname: string): {
  name: RateLimitProfileName;
  config: RateLimitProfile;
} {
  if (pathname === "/api/tunnel") {
    return { name: "sentryTunnel", config: PROFILES.sentryTunnel };
  }
  if (pathname.startsWith("/api/")) return { name: "api", config: PROFILES.api };
  if (pathname.startsWith("/_next/image")) return { name: "nextImage", config: PROFILES.nextImage };
  return { name: "page", config: PROFILES.page };
}

function toRetryAfterSeconds(config: RateLimitConfig): string {
  return String(Math.max(1, Math.ceil(config.windowMs / 1000)));
}

function build429(profileName: string, retryAfterSeconds: string): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Please slow down and try again." },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": retryAfterSeconds,
        "X-RateLimit-Scope": profileName,
      },
    },
  );
}

export function sitewideRateLimitMiddleware(
  request: NextRequest,
  options?: SitewideRateLimitOptions,
): NextResponse | null {
  // Never rate limit preflight.
  if (request.method === "OPTIONS") return null;

  const pathname = request.nextUrl?.pathname ?? new URL(request.url).pathname;
  if (isHealthCheckPath(pathname)) return null;

  const storePrefix = options?.storePrefix ?? DEFAULT_STORE_PREFIX;
  const clientIp = getClientIp(request.headers, { fallback: "anonymous" });
  const { name: profileName, config: profile } = getProfileForPath(pathname);

  const burstStore = `${storePrefix}:${profileName}:burst`;
  if (!isOperationAllowed(burstStore, clientIp, profile.burst)) {
    console.warn(`[RateLimit] Blocked burst: ${pathname} ${request.method} ip=${clientIp}`);
    return build429("burst", toRetryAfterSeconds(profile.burst));
  }

  const minuteStore = `${storePrefix}:${profileName}:minute`;
  if (!isOperationAllowed(minuteStore, clientIp, profile.minute)) {
    console.warn(`[RateLimit] Blocked minute: ${pathname} ${request.method} ip=${clientIp}`);
    return build429("minute", toRetryAfterSeconds(profile.minute));
  }

  return null;
}
