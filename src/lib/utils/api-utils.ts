/**
 * API Utilities
 *
 * Shared utilities for Next.js API routes including caching control,
 * error handling, and authentication validation.
 *
 * @module lib/utils/api-utils
 */

import { unstable_noStore as noStore } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Standard headers to prevent caching in the response.
 * Used for API routes that return dynamic data.
 */
export const NO_STORE_HEADERS: HeadersInit = { "Cache-Control": "no-store" };

/**
 * Opt out of static caching for the current request.
 * Wraps Next.js unstable_noStore to be safe and consistent.
 *
 * Usage:
 * Call this at the start of any GET request handler that needs dynamic data.
 */
export function preventCaching(): void {
  if (typeof noStore === "function") {
    noStore();
  }
}

/**
 * Validates an authorization header against a secret.
 * Supports "Bearer <token>" format.
 *
 * @param request - The incoming NextRequest
 * @param secret - The secret to validate against (e.g. process.env.MY_SECRET)
 * @returns true if authorized, false otherwise
 */
export function validateAuthSecret(request: NextRequest, secret: string | undefined): boolean {
  if (!secret) return false;

  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;

  // Check simple match or Bearer token
  return authHeader === secret || authHeader === `Bearer ${secret}`;
}

/**
 * Create a standard error response JSON.
 * automatically includes NO_STORE_HEADERS for 4xx/5xx errors to prevent caching errors.
 *
 * @param message - The error message
 * @param status - HTTP status code (default 500)
 * @param additionalHeaders - Optional extra headers
 * @returns NextResponse with error JSON
 */
export function createErrorResponse(
  message: string,
  status = 500,
  additionalHeaders?: HeadersInit,
): NextResponse {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: {
        ...NO_STORE_HEADERS,
        ...additionalHeaders,
      },
    },
  );
}
