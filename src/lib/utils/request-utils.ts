/**
 * HTTP Request Utilities
 *
 * Shared utilities for extracting client information from HTTP requests.
 * Provides consistent IP detection across proxy headers (Cloudflare, nginx, etc.)
 *
 * @module lib/utils/request-utils
 */

/**
 * Standard IP header precedence order.
 * Cloudflare headers are prioritized, followed by standard proxy headers.
 */
const IP_HEADERS = ["True-Client-IP", "CF-Connecting-IP", "X-Forwarded-For", "X-Real-IP"] as const;

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
