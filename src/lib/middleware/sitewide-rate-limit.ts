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
import { buildApiRateLimitResponse, buildRateLimitedPageResponse } from "@/lib/utils/api-utils";
import { classifyProxyRequest, getClientIp, hashIpBucket } from "@/lib/utils/request-utils";
import type {
  ProxyRequestClass,
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
} as const;

/**
 * Determine the rate limit profile for a given pathname.
 * Returns both the profile name and config to avoid duplicate routing logic.
 */
function getProfileForRequest(
  pathname: string,
  requestClass: ProxyRequestClass,
): {
  name: RateLimitProfileName;
  config: RateLimitProfile;
} | null {
  if (requestClass === "document") {
    return { name: "page", config: PROFILES.page };
  }
  if (requestClass !== "api") {
    return null;
  }
  if (pathname === "/api/tunnel") {
    return { name: "sentryTunnel", config: PROFILES.sentryTunnel };
  }
  return { name: "api", config: PROFILES.api };
}

function toRetryAfterSeconds(config: RateLimitConfig): string {
  return String(Math.max(1, Math.ceil(config.windowMs / 1000)));
}

function logThrottleEvent(args: {
  path: string;
  requestClass: ProxyRequestClass;
  retryAfterSeconds: string;
  ip: string;
  scope: string;
}): void {
  console.warn(
    JSON.stringify({
      type: "proxy.rate_limit.blocked",
      path: args.path,
      requestClass: args.requestClass,
      retryAfter: Number(args.retryAfterSeconds),
      ipBucket: hashIpBucket(args.ip),
      scope: args.scope,
      handled: true,
    }),
  );
}

function buildRateLimitResponse(args: {
  requestClass: ProxyRequestClass;
  retryAfterSeconds: string;
  scope: string;
  rateLimitLimit: number;
  rateLimitWindowSeconds: number;
}): NextResponse {
  const retryAfterSeconds = Number(args.retryAfterSeconds);
  if (args.requestClass === "document") {
    return buildRateLimitedPageResponse({
      retryAfterSeconds,
      rateLimitScope: args.scope,
    });
  }

  return buildApiRateLimitResponse({
    retryAfterSeconds,
    rateLimitScope: args.scope,
    rateLimitLimit: args.rateLimitLimit,
    rateLimitWindowSeconds: args.rateLimitWindowSeconds,
  });
}

export function sitewideRateLimitMiddleware(
  request: NextRequest,
  options?: SitewideRateLimitOptions,
): NextResponse | null {
  // Never rate limit preflight.
  if (request.method === "OPTIONS") return null;

  const pathname = request.nextUrl?.pathname ?? new URL(request.url).pathname;
  if (isHealthCheckPath(pathname)) return null;

  const requestClass = classifyProxyRequest(request);
  if (requestClass === "rsc" || requestClass === "prefetch" || requestClass === "image") {
    return null;
  }

  const profileEntry = getProfileForRequest(pathname, requestClass);
  if (!profileEntry) return null;

  const storePrefix = options?.storePrefix ?? DEFAULT_STORE_PREFIX;
  const clientIp = getClientIp(request.headers, { fallback: "anonymous" });
  const { name: profileName, config: profile } = profileEntry;

  const burstStore = `${storePrefix}:${profileName}:burst`;
  if (!isOperationAllowed(burstStore, clientIp, profile.burst)) {
    const retryAfterSeconds = toRetryAfterSeconds(profile.burst);
    logThrottleEvent({
      path: pathname,
      requestClass,
      retryAfterSeconds,
      ip: clientIp,
      scope: "burst",
    });
    return buildRateLimitResponse({
      requestClass,
      retryAfterSeconds,
      scope: "burst",
      rateLimitLimit: profile.burst.maxRequests,
      rateLimitWindowSeconds: Math.ceil(profile.burst.windowMs / 1000),
    });
  }

  const minuteStore = `${storePrefix}:${profileName}:minute`;
  if (!isOperationAllowed(minuteStore, clientIp, profile.minute)) {
    const retryAfterSeconds = toRetryAfterSeconds(profile.minute);
    logThrottleEvent({
      path: pathname,
      requestClass,
      retryAfterSeconds,
      ip: clientIp,
      scope: "minute",
    });
    return buildRateLimitResponse({
      requestClass,
      retryAfterSeconds,
      scope: "minute",
      rateLimitLimit: profile.minute.maxRequests,
      rateLimitWindowSeconds: Math.ceil(profile.minute.windowMs / 1000),
    });
  }

  return null;
}
