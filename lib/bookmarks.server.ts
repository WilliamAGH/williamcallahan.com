/**
 * Bookmarks Server API
 *
 * Server-side only bookmark operations
 * Handles file system access and build-time operations
 *
 * @module lib/bookmarks.server
 */

import fs from "node:fs";
import path from "node:path";
import type { UnifiedBookmark } from "@/types";
import { getBookmarks, initializeBookmarksDataAccess } from "@/lib/data-access/bookmarks";

/**
 * Read bookmarks directly from the file system during build time
 *
 * Used for static site generation to avoid API calls during build
 * This function should only be called server-side
 */
export async function getBookmarksForStaticBuild(): Promise<UnifiedBookmark[]> {
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

  if (isBuildPhase) {
    const bookmarksPath = path.join(process.cwd(), "data", "bookmarks", "bookmarks.json");
    try {
      const fileContents = fs.readFileSync(bookmarksPath, "utf-8");
      const bookmarks = JSON.parse(fileContents) as UnifiedBookmark[];
      console.log(`[Static Build] Read ${bookmarks.length} bookmarks from file system`);
      return bookmarks;
    } catch (error) {
      console.error("[Static Build] Error reading bookmarks from file system:", {
        path: bookmarksPath,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  // Fall back to data access layer for non-build environments
  await initializeBookmarksDataAccess();
  return getBookmarks();
}
