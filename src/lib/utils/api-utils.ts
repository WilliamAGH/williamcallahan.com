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
import { getEnvironment } from "@/lib/config/environment";
import logger from "@/lib/utils/logger";
import { validateCloudflareHeaders } from "@/lib/utils/request-utils";
import type { StandardApiErrorCode, StandardApiErrorResponse } from "@/types/schemas/api";

/**
 * Standard headers to prevent caching in the response.
 * Used for API routes that return dynamic data.
 */
export const NO_STORE_HEADERS: HeadersInit = { "Cache-Control": "no-store" };
export const RATE_LIMITED_MESSAGE =
  "You've reached a rate limit. Please wait a few minutes and try again.";
export const SERVICE_UNAVAILABLE_MESSAGE =
  "The server is temporarily under heavy load. Please wait a few minutes and try again.";

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

function normalizeRetryAfterSeconds(value: number): number {
  return Math.max(1, Math.ceil(value));
}

function toRetryAfterAt(retryAfterSeconds: number): string {
  return new Date(Date.now() + retryAfterSeconds * 1000).toISOString();
}

function buildStandardErrorPayload(args: {
  code: StandardApiErrorCode;
  message: string;
  status: 429 | 503;
  retryAfterSeconds: number;
}): StandardApiErrorResponse {
  return {
    code: args.code,
    message: args.message,
    retryAfterSeconds: args.retryAfterSeconds,
    retryAfterAt: toRetryAfterAt(args.retryAfterSeconds),
    status: args.status,
  };
}

function withRetryHeaders(args: {
  retryAfterSeconds: number;
  rateLimitScope?: string;
  rateLimitLimit?: number;
  rateLimitWindowSeconds?: number;
}): Record<string, string> {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "Retry-After": String(args.retryAfterSeconds),
  };

  if (args.rateLimitScope) {
    headers["X-RateLimit-Scope"] = args.rateLimitScope;
  }
  if (typeof args.rateLimitLimit === "number") {
    headers["X-RateLimit-Limit"] = String(args.rateLimitLimit);
  }
  if (typeof args.rateLimitWindowSeconds === "number") {
    headers["X-RateLimit-Window"] = `${args.rateLimitWindowSeconds}s`;
  }

  return headers;
}

function buildErrorPageHtml(args: { status: number; title: string; message: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${args.status} ${args.title}</title>
  <style>
    body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f6f8fb;color:#0f172a}
    main{max-width:48rem;margin:8vh auto;padding:2rem}
    .card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:1.25rem 1.5rem;box-shadow:0 8px 24px rgba(15,23,42,.06)}
    h1{font-size:1.25rem;margin:0 0 .5rem}
    p{line-height:1.5;margin:0}
  </style>
</head>
<body>
  <main>
    <section class="card" role="alert" aria-live="assertive">
      <h1>${args.status} ${args.title}</h1>
      <p>${args.message}</p>
    </section>
  </main>
</body>
</html>`;
}

export function buildApiRateLimitResponse(options: {
  retryAfterSeconds: number;
  message?: string;
  rateLimitScope?: string;
  rateLimitLimit?: number;
  rateLimitWindowSeconds?: number;
}): NextResponse {
  const retryAfterSeconds = normalizeRetryAfterSeconds(options.retryAfterSeconds);
  return NextResponse.json(
    buildStandardErrorPayload({
      code: "RATE_LIMITED",
      message: options.message ?? RATE_LIMITED_MESSAGE,
      status: 429,
      retryAfterSeconds,
    }),
    {
      status: 429,
      headers: withRetryHeaders({
        retryAfterSeconds,
        rateLimitScope: options.rateLimitScope,
        rateLimitLimit: options.rateLimitLimit,
        rateLimitWindowSeconds: options.rateLimitWindowSeconds,
      }),
    },
  );
}

export function buildApiServiceBusyResponse(options: {
  retryAfterSeconds: number;
  message?: string;
  rateLimitScope?: string;
}): NextResponse {
  const retryAfterSeconds = normalizeRetryAfterSeconds(options.retryAfterSeconds);
  return NextResponse.json(
    buildStandardErrorPayload({
      code: "SERVICE_UNAVAILABLE",
      message: options.message ?? SERVICE_UNAVAILABLE_MESSAGE,
      status: 503,
      retryAfterSeconds,
    }),
    {
      status: 503,
      headers: withRetryHeaders({
        retryAfterSeconds,
        rateLimitScope: options.rateLimitScope,
      }),
    },
  );
}

export function buildRateLimitedPageResponse(options: {
  retryAfterSeconds: number;
  message?: string;
  rateLimitScope?: string;
}): NextResponse {
  const retryAfterSeconds = normalizeRetryAfterSeconds(options.retryAfterSeconds);
  const headers = withRetryHeaders({
    retryAfterSeconds,
    rateLimitScope: options.rateLimitScope,
  });
  headers["Content-Type"] = "text/html; charset=utf-8";

  return new NextResponse(
    buildErrorPageHtml({
      status: 429,
      title: "Rate Limit Reached",
      message: options.message ?? RATE_LIMITED_MESSAGE,
    }),
    { status: 429, headers },
  );
}

export function buildServiceBusyPageResponse(options: {
  retryAfterSeconds: number;
  message?: string;
}): NextResponse {
  const retryAfterSeconds = normalizeRetryAfterSeconds(options.retryAfterSeconds);
  const headers = withRetryHeaders({ retryAfterSeconds });
  headers["Content-Type"] = "text/html; charset=utf-8";

  return new NextResponse(
    buildErrorPageHtml({
      status: 503,
      title: "Service Temporarily Unavailable",
      message: options.message ?? SERVICE_UNAVAILABLE_MESSAGE,
    }),
    { status: 503, headers },
  );
}

export function requireCloudflareHeaders(
  headers: Headers,
  options: { route: string; additionalHeaders?: HeadersInit },
): NextResponse | null {
  if (getEnvironment() !== "production") {
    return null;
  }

  const validation = validateCloudflareHeaders(headers);
  if (validation.isValid) {
    return null;
  }

  logger.warn(`[Cloudflare] Blocking request with missing/invalid Cloudflare headers`, {
    route: options.route,
    reasons: validation.reasons,
    details: validation.details,
  });

  return createErrorResponse("Forbidden", 403, options.additionalHeaders);
}
