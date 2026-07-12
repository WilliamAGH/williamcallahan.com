/**
 * OG Image URL Builder
 * @module lib/og-image/build-og-url
 * @description
 * Builds type-safe URLs for the /api/og/[entity] endpoint.
 * Used by page-level generateMetadata() functions to construct OG image URLs.
 *
 * Uses ensureAbsoluteUrl from the SEO module (resolves against NEXT_PUBLIC_SITE_URL)
 * rather than the security module (which resolves against request origin).
 */

import { ensureAbsoluteUrl } from "@/lib/seo/url-utils";
import type { OgEntity } from "@/types/schemas/og-image";

function encodePayload(params: Record<string, string>): string {
  const bytes = new TextEncoder().encode(JSON.stringify(params));
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/**
 * Build an absolute URL for the OG image generation endpoint.
 * Filters out undefined/empty params and URL-encodes values.
 *
 * @param entity - The entity type (books, blog, projects, etc.)
 * @param params - Key-value pairs for query parameters
 * @returns Absolute URL to the OG image endpoint
 */
export function buildOgImageUrl(
  entity: OgEntity,
  params: Record<string, string | undefined>,
): string {
  const payloadParams: Record<string, string> = {};

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      payloadParams[key] = value;
    }
  }

  const payload =
    Object.keys(payloadParams).length > 0 ? encodeURIComponent(encodePayload(payloadParams)) : "";
  const path = payload ? `/api/og/${entity}?payload=${payload}` : `/api/og/${entity}`;
  return ensureAbsoluteUrl(path);
}
