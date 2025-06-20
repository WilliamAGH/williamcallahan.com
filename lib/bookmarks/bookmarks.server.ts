/**
 * Bookmarks Server API
 *
 * Server-side only bookmark operations
 * Handles file system access and build-time operations
 *
 * @module lib/bookmarks.server
 */

import type { UnifiedBookmark } from "@/types";
import { getBookmarks, initializeBookmarksDataAccess } from "@/lib/bookmarks/bookmarks-data-access.server";

/**
 * Get bookmarks for static site generation
 *
 * Uses the same S3 data source as the build prefetch to ensure consistency.
 * Previously read from local file system which could be outdated.
 *
 * This function should only be called server-side during build or static generation.
 */
export async function getBookmarksForStaticBuild(): Promise<UnifiedBookmark[]> {
  // Always use the data access layer for consistency with prefetch data
  // This ensures sitemap generation uses the same S3 data (99 bookmarks)
  // that was fetched during the build prefetch phase
  console.log("[Static Build] Fetching bookmarks from S3 data access layer");

  initializeBookmarksDataAccess();
  const bookmarks = await getBookmarks(true); // skipExternalFetch = true for build performance

  console.log(`[Static Build] Successfully retrieved ${bookmarks.length} bookmarks from S3`);
  return bookmarks;
}
