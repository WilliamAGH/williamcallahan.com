/**
 * Client-safe SEO URL helpers
 * @module lib/seo/url-utils
 *
 * URL and image helpers that are safe to import from Client Components.
 * This module MUST NOT import server-only modules.
 */

import { NEXT_PUBLIC_SITE_URL } from "@/lib/constants/client";
import { IMAGE_MIME_TYPES } from "@/lib/utils/content-type";

/**
 * Ensures a URL is absolute by prepending the site URL if necessary.
 *
 * - Returns data URIs and non-http(s) protocols as-is
 * - Treats empty/whitespace as root
 */
export function ensureAbsoluteUrl(path: string): string {
  if (path.startsWith("data:") || /^[a-z][a-z0-9+\-.]*:/i.test(path)) {
    return path;
  }

  if (!path || !path.trim()) {
    return NEXT_PUBLIC_SITE_URL.endsWith("/") ? NEXT_PUBLIC_SITE_URL : `${NEXT_PUBLIC_SITE_URL}/`;
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const cleanPath = path.replace(/^\/+/, "");
  const baseUrl = NEXT_PUBLIC_SITE_URL.endsWith("/")
    ? NEXT_PUBLIC_SITE_URL
    : `${NEXT_PUBLIC_SITE_URL}/`;

  return `${baseUrl}${cleanPath}`;
}

/**
 * Resolves an image URL, preserving root-relative paths for current-origin handling.
 */
export function resolveImageUrl(url?: string): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("/")) return url;
  return ensureAbsoluteUrl(url);
}

/**
 * Determines the MIME type of an image based on its file extension.
 */
export function getImageTypeFromUrl(url: string): string | undefined {
  if (!url) return undefined;

  const cleanUrl = url.split(/[?#]/)[0];
  const extension = cleanUrl?.split(".").pop()?.toLowerCase();
  if (!extension) return undefined;

  return IMAGE_MIME_TYPES[extension];
}
