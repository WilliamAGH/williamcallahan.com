/**
 * OG Image SSRF Protection
 * @module lib/og-image/security
 * @description
 * Security utilities for validating image URLs in OG image generation.
 * Prevents SSRF attacks by blocking private/internal hosts and restricting protocols.
 *
 * This module is distinct from @/lib/seo/url-utils (which resolves against NEXT_PUBLIC_SITE_URL
 * for metadata). This module resolves against the incoming request origin and includes
 * host-level SSRF validation for fetching external images.
 */

import { normalizeString } from "@/lib/utils";
import { isPrivateIP } from "@/types/schemas/url";

/** Hosts blocked to prevent SSRF (localhost variants + cloud metadata endpoints) */
const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
  "169.254.169.254", // AWS/GCP/Azure instance metadata
  "metadata.google.internal", // GCP metadata
]);

/** Fetch timeout to prevent slow-loris attacks */
export const FETCH_TIMEOUT_MS = 5_000;

/** Maximum image download size (4 MiB streaming limit) */
export const MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024;

/** Maximum decoded pixel count to guard against decompression bombs */
export const MAX_INPUT_PIXELS = 40_000_000;

/**
 * Check if a hostname falls within private/internal IP ranges.
 * Normalizes the input and delegates IPv4/IPv6 checks to the shared isPrivateIP helper.
 */
export function isPrivateHost(hostname: string): boolean {
  const normalizedHost = normalizeString(hostname);
  const bracketStrippedHost = normalizedHost.replace(/^\[|\]$/g, "");

  if (BLOCKED_HOSTS.has(normalizedHost) || BLOCKED_HOSTS.has(bracketStrippedHost)) {
    return true;
  }

  return isPrivateIP(bracketStrippedHost);
}

/**
 * Resolve a potentially relative URL against the request origin.
 * Only allows http/https protocols. Blocks private hosts for cross-origin requests.
 *
 * Same-origin requests (e.g., /api/cache/images) are always permitted since
 * they call our own server.
 *
 * @throws Error if the protocol is unsupported or the host is blocked
 */
export function ensureAbsoluteUrl(url: string, requestOrigin: string): string {
  const resolved = new URL(url, requestOrigin);
  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
    throw new Error(`Unsupported image URL protocol: ${resolved.protocol}`);
  }

  const isSameOrigin = resolved.origin === requestOrigin;

  if (!isSameOrigin && isPrivateHost(resolved.hostname)) {
    throw new Error(`Blocked image URL host: ${resolved.hostname}`);
  }

  return resolved.toString();
}
