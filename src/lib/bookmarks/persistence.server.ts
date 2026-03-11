/**
 * @file Bookmark persistence operations
 * @module lib/bookmarks/persistence.server
 *
 * Primary store: PostgreSQL.
 */

import type { UnifiedBookmark } from "@/types/schemas/bookmark";

/**
 * Write bookmark master data to PostgreSQL.
 *
 * @param bookmarksWithSlugs - Bookmarks with embedded slugs
 */
export async function writeBookmarkMasterFiles(
  bookmarksWithSlugs: UnifiedBookmark[],
): Promise<void> {
  const { upsertUnifiedBookmarks } = await import("@/lib/db/mutations/bookmarks");
  await upsertUnifiedBookmarks(bookmarksWithSlugs);

  const embeddingModel = process.env.AI_DEFAULT_EMBEDDING_MODEL?.trim();
  if (!embeddingModel) {
    return;
  }

  const { backfillBookmarkEmbeddings } = await import("@/lib/db/mutations/bookmark-embeddings");
  const result = await backfillBookmarkEmbeddings({
    bookmarkIds: bookmarksWithSlugs.map((bookmark) => bookmark.id),
    maxRows: bookmarksWithSlugs.length,
  });
  if (result.updatedRows > 0) {
    console.log(
      `[bookmarks/persistence] Updated ${result.updatedRows} bookmark embeddings using ${result.usedModel}.`,
    );
  }
}
