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
 * Optimized for build-time performance:
 * 1. Uses memory cache first (populated by prefetch)
 * 2. Falls back to S3 with skipExternalFetch=true
 * 3. Prevents OpenGraph/logo refetching during build
 *
 * This function should only be called server-side during build or static generation.
 */
export async function getBookmarksForStaticBuild(): Promise<UnifiedBookmark[]> {
  console.log("[Static Build] Getting bookmarks for static site generation");

  // Always use the data access layer for consistency with prefetch data
  // The prefetch phase should have already populated the memory cache
  initializeBookmarksDataAccess();

  // Use skipExternalFetch=true to prevent OpenGraph/logo refetching during build
  const bookmarks = await getBookmarks(true); // This will use memory cache first, then S3

  console.log(`[Static Build] Successfully retrieved ${bookmarks.length} bookmarks (memory cache + S3 fallback)`);
  return bookmarks;
}
