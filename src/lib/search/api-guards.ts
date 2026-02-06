/**
 * Search API Guards
 *
 * Shared rate limiting and memory pressure checks for search API endpoints.
 * Extracted from app/api/search/all/route.ts to ensure consistent protection
 * across both scoped and site-wide search endpoints.
 */

import { isOperationAllowed } from "@/lib/rate-limiter";
import { NextResponse, type NextRequest } from "next/server";
import { getClientIp as getClientIpFromHeaders } from "@/lib/utils/request-utils";
import {
  NO_STORE_HEADERS,
  buildApiRateLimitResponse,
  buildApiServiceBusyResponse,
} from "@/lib/utils/api-utils";
import os from "node:os";

// ────────────────────────────────────────────────────────────────────────────
// Memory pressure check (adaptive & configurable)
//
// 1. Allows overriding the absolute threshold via `MEMORY_CRITICAL_BYTES`.
// 2. Alternatively, allows a percentage-based threshold via
//    `MEMORY_CRITICAL_PERCENT` (e.g. "90" for 90 % of total RAM).
// 3. Falls back to a sensible default (3 GB) when no override is provided.
//
// This prevents false positives on machines with >3.5 GB RAM while still
// protecting low-memory environments.
// ────────────────────────────────────────────────────────────────────────────

/** Default critical memory threshold when no env override is provided (3 GB). */
const DEFAULT_CRITICAL_THRESHOLD_BYTES = 3 * 1024 * 1024 * 1024;

/**
 * Get the memory threshold for critical pressure detection.
 * Configurable via MEMORY_CRITICAL_BYTES or MEMORY_CRITICAL_PERCENT env vars.
 */
export function getCriticalThreshold(): number {
  const bytesEnv = process.env.MEMORY_CRITICAL_BYTES;
  if (bytesEnv !== undefined) {
    const parsed = Number(bytesEnv);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
    console.warn(
      `[api-guards] MEMORY_CRITICAL_BYTES="${bytesEnv}" is invalid; using default ${DEFAULT_CRITICAL_THRESHOLD_BYTES} bytes`,
    );
    return DEFAULT_CRITICAL_THRESHOLD_BYTES;
  }

  const percentEnv = process.env.MEMORY_CRITICAL_PERCENT?.trim();
  if (percentEnv) {
    const parsed = Number(percentEnv);
    if (!Number.isNaN(parsed) && parsed > 0) {
      const percent = Math.min(Math.max(parsed, 1), 99);
      try {
        const total = os.totalmem();
        return (percent / 100) * total;
      } catch (err) {
        console.warn("[api-guards] os.totalmem() failed, using default threshold:", err);
      }
    } else {
      console.warn(
        `[api-guards] MEMORY_CRITICAL_PERCENT="${percentEnv}" is invalid; using default ${DEFAULT_CRITICAL_THRESHOLD_BYTES} bytes`,
      );
    }
  }

  return DEFAULT_CRITICAL_THRESHOLD_BYTES;
}

/**
 * Check if the server is under critical memory pressure.
 * Always returns false in development/test environments.
 */
export function isMemoryCritical(): boolean {
  // Disable guard during local development and test runs
  if (process.env.NODE_ENV !== "production") {
    return false;
  }

  if (typeof process === "undefined") return false;

  const { rss } = process.memoryUsage();
  return rss > getCriticalThreshold();
}

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
 * Check memory pressure before processing search.
 * Returns a 503 response if under critical pressure, or null if OK.
 */
export function checkMemoryPressure(): NextResponse | null {
  if (isMemoryCritical()) {
    const response = buildApiServiceBusyResponse({
      retryAfterSeconds: 180,
      rateLimitScope: "memory",
    });
    response.headers.set("X-Memory-Pressure", "critical");
    return response;
  }
  return null;
}

/**
 * Apply all search API guards (rate limiting + memory pressure).
 * Returns an error response if any guard fails, or null if all pass.
 *
 * @param request - The incoming request (used to extract client IP)
 * @returns NextResponse error if blocked, or null if request can proceed
 */
export function applySearchGuards(request: NextRequest): NextResponse | null {
  // Check rate limiting first (cheaper check)
  const clientIp = getClientIp(request);
  const rateLimitResponse = checkSearchRateLimit(clientIp);
  if (rateLimitResponse) return rateLimitResponse;

  // Check memory pressure
  const memoryResponse = checkMemoryPressure();
  if (memoryResponse) return memoryResponse;

  return null;
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
