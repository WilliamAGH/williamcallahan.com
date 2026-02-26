/**
 * @fileoverview Client-safe bookmark exports only.
 * For server-side bookmark operations, import from specific server files.
 * @version 2.0.0
 */

// Client-safe exports only
export { fetchBookmarksFromApi } from "./bookmarks.client";

// Helper utilities (client-safe)
export * from "./bookmark-helpers";

// Type exports (client-safe)
export * from "./api-client";

// Re-export client-safe functions from bookmarks (no server imports)
export { refreshBookmarksData } from "./bookmarks";

// Server-side utility (re-exported for tests – not intended for browser bundles)
export { getBookmarks } from "./bookmarks-data-access.server";
