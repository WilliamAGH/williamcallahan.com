/**
 * Data access directory index - fallback for module resolution
 *
 * @module lib/data-access/index
 */

// Bookmarks exports are now in @/lib/bookmarks (server-specific)
export {
  getBookmarks,
  initializeBookmarksDataAccess,
  cleanupBookmarksDataAccess,
} from "@/lib/bookmarks/bookmarks-data-access.server";
export * from "./logos";
export * from "./investments";
export * from "./github";
