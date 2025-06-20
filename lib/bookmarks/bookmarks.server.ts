/**
 * Bookmarks Server API
 *
 * Server-side only bookmark operations
 * Handles file system access and build-time operations
 *
 * @module lib/bookmarks.server
 */

import type { UnifiedBookmark } from "@/types";

/**
 * Get minimal bookmark data for static site generation
 *
 * Build-time optimization strategy:
 * 1. Returns empty array to prevent any image/logo processing during build
 * 2. Static pages will show loading states initially
 * 3. Client-side hydration will fetch actual bookmark data with images
 * 4. Prevents build-time external API calls and S3 image processing
 *
 * This ensures fast, predictable builds while maintaining full functionality at runtime.
 * All image processing (OpenGraph, logos) happens on first client request only.
 */
export function getBookmarksForStaticBuild(): UnifiedBookmark[] {
  console.log("[Static Build] Skipping bookmark data fetch - images/logos will load on first request only");

  // Return empty array to prevent any build-time image processing
  // Static pages will show appropriate loading states until client-side hydration
  return [];
}
