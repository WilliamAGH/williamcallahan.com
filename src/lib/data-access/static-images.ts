/**
 * Static Image Mapping Resolver
 *
 * ‼️  SINGLE RESPONSIBILITY ‼️
 * ---------------------------------------------------------------------------
 * This helper exposes **ONLY** the minimal runtime required to translate a
 * legacy "public-folder" image path (e.g. `/images/foo.png`) into its
 * corresponding immutable S3 CDN URL (e.g.
 * `https://s3-storage.example.com/images/foo_ab12cd34.png`).
 *
 * DO NOT:
 *   • Add business-domain constants (placeholders, profile pics, etc.) – those
 *     live in `placeholder-images.ts`.
 *   • Add image-processing utilities – see `lib/image-handling/*`.
 *
 * WHY KEEP A JSON MAP?
 *   We migrated historical static assets to S3 with content-hash suffixes for
 *   cache-busting.  A deterministic naming scheme for *new* assets makes the
 *   map unnecessary moving forward, but for the migrated set we still need a
 *   lookup table.  Once all call-sites use deterministic keys we can delete
 *   `static-image-mapping.json` **and** this helper.
 */

import staticImageMapping from "./static-image-mapping.json";

/**
 * Get the S3 CDN URL for a static image
 * Falls back to the local path if not found in mapping
 */
export function getStaticImageUrl(localPath: string): string {
  // Ensure path starts with /
  const normalizedPath = localPath.startsWith("/") ? localPath : `/${localPath}`;

  // Check if we have a mapping
  const cdnUrl = staticImageMapping[normalizedPath as keyof typeof staticImageMapping];
  if (cdnUrl) {
    return cdnUrl;
  }

  // Fallback to local path
  console.warn(`[StaticImages] No S3 mapping for: ${normalizedPath}`);
  return localPath;
}

/**
 * Get all static image mappings
 */
export function getAllStaticImageMappings(): Record<string, string> {
  return staticImageMapping;
}
