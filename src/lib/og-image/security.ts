/**
 * OG Image SSRF Protection
 * @module lib/og-image/security
 * @description
 * Security utilities for validating image URLs in OG image generation.
 * Prevents SSRF attacks by blocking private/internal hosts and restricting protocols.
 *
 * This module is distinct from @/lib/seo/url-utils (which resolves against NEXT_PUBLIC_SITE_URL
 * for metadata). This module resolves against the canonical server base URL and includes
 * host-level SSRF validation for fetching external images.
 */

import { getBaseUrl } from "@/lib/utils/get-base-url";
import { normalizeString } from "@/lib/utils";
import { isPrivateIP } from "@/types/schemas/url";

/** Non-IP metadata hostname not covered by the shared private-IP classifier. */
const BLOCKED_HOSTS = new Set(["metadata.google.internal"]);

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
  const normalizedHost = normalizeString(hostname)
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "");

  return BLOCKED_HOSTS.has(normalizedHost) || isPrivateIP(normalizedHost);
}

/**
 * Resolve a potentially relative URL against the canonical server base URL.
 * Only allows http/https protocols. Blocks private hosts unless they are the
 * canonical base itself, which permits local development self-fetches without
 * trusting attacker-controlled request headers.
 *
 * @throws Error if the protocol is unsupported or the host is blocked
 */
export function ensureAbsoluteUrl(url: string): string {
  const canonicalBaseUrl = new URL(getBaseUrl());
  const resolved = new URL(url, canonicalBaseUrl);
  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
    throw new Error(`Unsupported image URL protocol: ${resolved.protocol}`);
  }

  if (isPrivateHost(resolved.hostname) && resolved.origin !== canonicalBaseUrl.origin) {
    throw new Error(`Blocked image URL host: ${resolved.hostname}`);
  }

  return resolved.toString();
}
