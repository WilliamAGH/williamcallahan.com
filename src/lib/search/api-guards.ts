/**
 * Search API Guards
 *
 * Shared rate limiting checks for search API endpoints.
 * Extracted from app/api/search/all/route.ts to ensure consistent protection
 * across both scoped and site-wide search endpoints.
 */

import { isOperationAllowed } from "@/lib/rate-limiter";
import { NextResponse, type NextRequest } from "next/server";
import { getClientIp as getClientIpFromHeaders } from "@/lib/utils/request-utils";
import { NO_STORE_HEADERS, buildApiRateLimitResponse } from "@/lib/utils/api-utils";

/**
 * Extract client IP from request headers for rate limiting.
 */
export function getClientIp(request: NextRequest): string {
  return getClientIpFromHeaders(request.headers, { fallback: "anonymous" });
}

/**
 * Helper to create no-store headers with optional additional headers.
 */
export function withNoStoreHeaders(additional?: Record<string, string>): HeadersInit {
  return additional ? { ...NO_STORE_HEADERS, ...additional } : NO_STORE_HEADERS;
}

/**
 * Search API rate limiting configuration.
 * 10 searches per minute per IP address.
 */
export const SEARCH_RATE_LIMIT = {
  maxRequests: 10,
  windowMs: 60000, // 1 minute
} as const;

/**
 * Check rate limiting for search operations.
 * Returns a 429 response if rate limit exceeded, or null if allowed.
 */
export function checkSearchRateLimit(clientIp: string): NextResponse | null {
  if (!isOperationAllowed("search", clientIp, SEARCH_RATE_LIMIT)) {
    return buildApiRateLimitResponse({
      retryAfterSeconds: Math.ceil(SEARCH_RATE_LIMIT.windowMs / 1000),
      rateLimitScope: "search",
      rateLimitLimit: SEARCH_RATE_LIMIT.maxRequests,
      rateLimitWindowSeconds: Math.ceil(SEARCH_RATE_LIMIT.windowMs / 1000),
    });
  }
  return null;
}

/**
 * Apply all search API guards (rate limiting only).
 * Returns an error response if any guard fails, or null if all pass.
 *
 * @param request - The incoming request (used to extract client IP)
 * @returns NextResponse error if blocked, or null if request can proceed
 */
export function applySearchGuards(request: NextRequest): NextResponse | null {
  // Check rate limiting
  const clientIp = getClientIp(request);
  return checkSearchRateLimit(clientIp);
}

/**
 * Create a production-safe error response for search API errors.
 * In production, internal error details are omitted to prevent information disclosure.
 * In development/test, details are included to aid debugging.
 *
 * @param userMessage - User-facing error message (always shown)
 * @param internalError - Internal error details (only shown in non-production)
 * @param status - HTTP status code (default: 500)
 * @returns NextResponse with appropriate error details
 */
export function createSearchErrorResponse(
  userMessage: string,
  internalError: string,
  status = 500,
): NextResponse {
  const isProduction = process.env.NODE_ENV === "production";

  const body = isProduction
    ? { error: userMessage }
    : { error: userMessage, details: internalError };

  return NextResponse.json(body, {
    status,
    headers: withNoStoreHeaders(),
  });
}
