/**
 * @file Bookmark persistence operations
 * @module lib/bookmarks/persistence.server
 *
 * Primary store: PostgreSQL.
 */

import type { UnifiedBookmark } from "@/types";
import { invalidateBookmarkByIdCaches } from "@/lib/bookmarks/cache-management.server";

/**
 * Write bookmark master data to PostgreSQL.
 *
 * @param bookmarksWithSlugs - Bookmarks with embedded slugs
 */
export async function writeBookmarkMasterFiles(
  bookmarksWithSlugs: UnifiedBookmark[],
): Promise<void> {
  invalidateBookmarkByIdCaches();
  const { upsertUnifiedBookmarks } = await import("@/lib/db/mutations/bookmarks");
  await upsertUnifiedBookmarks(bookmarksWithSlugs);
}
