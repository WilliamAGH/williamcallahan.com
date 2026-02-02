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
  SitewideRateLimitOptions,
} from "@/types/middleware";

const DEFAULT_STORE_PREFIX = "sitewide";

const HEALTH_CHECK_PATHS = ["/api/health", "/api/health/metrics", "/api/health/deep"] as const;

const PROFILES: Record<"page" | "api" | "nextImage", RateLimitProfile> = {
  page: {
    // Allows normal browsing but blocks aggressive parallel crawling.
    burst: { maxRequests: 15, windowMs: 10_000 },
    minute: { maxRequests: 60, windowMs: 60_000 },
  },
  api: {
    // Keep this higher than route-level limits so specialized endpoints remain authoritative.
    burst: { maxRequests: 30, windowMs: 10_000 },
    minute: { maxRequests: 120, windowMs: 60_000 },
  },
  nextImage: {
    // Image optimization can be CPU/memory heavy; throttle bursts defensively.
    burst: { maxRequests: 20, windowMs: 10_000 },
    minute: { maxRequests: 120, windowMs: 60_000 },
  },
} as const;

function isHealthCheckPath(pathname: string): boolean {
  return HEALTH_CHECK_PATHS.some((path) => pathname.startsWith(path));
}

function getProfile(pathname: string): RateLimitProfile {
  if (pathname.startsWith("/api/")) return PROFILES.api;
  if (pathname.startsWith("/_next/image")) return PROFILES.nextImage;
  return PROFILES.page;
}

function getProfileName(pathname: string): "api" | "nextImage" | "page" {
  if (pathname.startsWith("/api/")) return "api";
  if (pathname.startsWith("/_next/image")) return "nextImage";
  return "page";
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
  const profileName = getProfileName(pathname);
  const profile = getProfile(pathname);

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
