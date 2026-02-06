/**
 * HTTP Request Utilities
 *
 * Shared utilities for extracting client information from HTTP requests.
 * Provides consistent IP detection across proxy headers (Cloudflare, nginx, etc.)
 *
 * @module lib/utils/request-utils
 */

import { isIP } from "node:net";
import type { CloudflareHeaderValidation } from "@/types/http";
import type { ProxyRequestClass } from "@/types/middleware";

/**
 * Standard IP header precedence order.
 * Cloudflare headers are prioritized, followed by standard proxy headers.
 */
const IP_HEADERS = ["True-Client-IP", "CF-Connecting-IP", "X-Forwarded-For", "X-Real-IP"] as const;

const CLOUDFLARE_REQUIRED_HEADERS = ["CF-Ray"] as const;
const CLOUDFLARE_IP_HEADERS = ["CF-Connecting-IP", "True-Client-IP"] as const;
const PREFETCH_HINT_VALUES = new Set(["prefetch", "prerender"]);

/**
 * Extracts the first IP address from a comma-separated header value.
 * X-Forwarded-For headers often contain multiple IPs: "client, proxy1, proxy2"
 *
 * @param headerValue - The raw header value (may be null)
 * @returns The first IP address or null if not found
 *
 * @example
 * getFirstIpFromHeader("203.0.113.195, 70.41.3.18, 150.172.238.178")
 * // Returns: "203.0.113.195"
 */
export function getFirstIpFromHeader(headerValue: string | null): string | null {
  if (!headerValue) return null;
  return headerValue.split(",")[0]?.trim() || null;
}

/**
 * Extracts the client IP address from HTTP headers.
 * Checks standard proxy headers in precedence order: True-Client-IP, CF-Connecting-IP,
 * X-Forwarded-For (first IP), X-Real-IP.
 *
 * @param headers - The Headers object from the request
 * @param options - Configuration options
 * @returns The client IP address or the fallback value
 *
 * @example
 * // In a Next.js API route:
 * const ip = getClientIp(request.headers);
 *
 * // With custom fallback:
 * const ip = getClientIp(request.headers, { fallback: "anonymous" });
 */
export function getClientIp(
  headers: Headers,
  options: { headerPrecedence?: readonly string[]; fallback?: string } = {},
): string {
  const { headerPrecedence = IP_HEADERS, fallback = "unknown" } = options;

  for (const header of headerPrecedence) {
    const value = headers.get(header);
    // For X-Forwarded-For, extract first IP from comma-separated list
    if (header === "X-Forwarded-For") {
      const ip = getFirstIpFromHeader(value);
      if (ip) return ip;
    } else if (value) {
      return value.trim();
    }
  }

  return fallback;
}

function normalizeHeaderValue(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeIpHeader(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const first = value.split(",")[0]?.trim();
  return first || undefined;
}

export function validateCloudflareHeaders(headers: Headers): CloudflareHeaderValidation {
  const host = normalizeHeaderValue(headers.get("host"));
  const cfRay = normalizeHeaderValue(headers.get(CLOUDFLARE_REQUIRED_HEADERS[0]));
  const cfConnectingIp = normalizeHeaderValue(headers.get(CLOUDFLARE_IP_HEADERS[0]));
  const trueClientIp = normalizeHeaderValue(headers.get(CLOUDFLARE_IP_HEADERS[1]));
  const forwardedProto = normalizeHeaderValue(headers.get("x-forwarded-proto"));
  const candidateIp = normalizeIpHeader(cfConnectingIp ?? trueClientIp);

  const reasons: string[] = [];

  if (!cfRay) {
    reasons.push("missing_cf_ray");
  }

  if (!candidateIp) {
    reasons.push("missing_cf_ip");
  } else if (isIP(candidateIp) === 0) {
    reasons.push("invalid_cf_ip");
  }

  return {
    isValid: reasons.length === 0,
    reasons,
    details: {
      host,
      cfRay,
      cfConnectingIp,
      trueClientIp,
      forwardedProto,
    },
  };
}

function hasPrefetchHeader(headers: Headers): boolean {
  if (headers.has("next-router-prefetch")) return true;

  const purpose = normalizeHeaderValue(headers.get("purpose"))?.toLowerCase();
  if (purpose && PREFETCH_HINT_VALUES.has(purpose)) return true;

  const secPurpose = normalizeHeaderValue(headers.get("sec-purpose"))?.toLowerCase();
  if (secPurpose && PREFETCH_HINT_VALUES.has(secPurpose)) return true;

  return false;
}

function isRscRequest(pathname: string, searchParams: URLSearchParams, headers: Headers): boolean {
  if (searchParams.has("_rsc")) return true;

  const rscHeader = normalizeHeaderValue(headers.get("rsc"));
  if (rscHeader === "1") return true;

  const accept = normalizeHeaderValue(headers.get("accept"))?.toLowerCase();
  if (accept?.includes("text/x-component")) return true;

  return pathname.endsWith(".rsc");
}

/** FNV-1a hash of an IP string, formatted as a hex bucket ID for structured
 *  logs. Avoids logging raw IPs while preserving per-client cardinality. */
export function hashIpBucket(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `ip-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function classifyProxyRequest(
  request: Pick<Request, "method" | "url" | "headers">,
): ProxyRequestClass {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const method = request.method.toUpperCase();
  const accept = normalizeHeaderValue(request.headers.get("accept"))?.toLowerCase() ?? "";
  const secFetchDest = normalizeHeaderValue(request.headers.get("sec-fetch-dest"))?.toLowerCase();
  const secFetchMode = normalizeHeaderValue(request.headers.get("sec-fetch-mode"))?.toLowerCase();

  if (pathname.startsWith("/api/")) return "api";
  if (pathname.startsWith("/_next/image")) return "image";
  if (hasPrefetchHeader(request.headers)) return "prefetch";
  if (isRscRequest(pathname, url.searchParams, request.headers)) return "rsc";
  if (
    method === "GET" &&
    (accept.includes("text/html") ||
      secFetchDest === "document" ||
      secFetchMode === "navigate" ||
      !pathname.includes("."))
  ) {
    return "document";
  }

  return "other";
}
