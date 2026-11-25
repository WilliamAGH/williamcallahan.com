/**
 * URL Validation Functions
 *
 * Provides validation functions that use the centralized Zod schemas
 * from the type system to prevent SSRF attacks and ensure security.
 */

import { safePathSchema } from "@/types/schemas/url";

/**
 * Sanitize a file path
 */
export function sanitizePath(path: string): string {
  return safePathSchema.parse(path);
}

/**
 * Security headers for image responses
 */
export const IMAGE_SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Content-Security-Policy":
    "default-src 'none'; img-src 'self' data: https:; style-src 'unsafe-inline'",
} as const;

/**
 * CDN-specific cache headers for image responses.
 * Explicitly instructs Cloudflare (and other CDNs) to cache at the edge
 * independently of browser Cache-Control. 1 year + immutable matches the
 * content-addressed, near-immutable nature of persisted images.
 */
export const IMAGE_CDN_CACHE_HEADERS = {
  "CDN-Cache-Control": "public, max-age=31536000, immutable",
  "Cloudflare-CDN-Cache-Control": "public, max-age=31536000, immutable",
} as const;
