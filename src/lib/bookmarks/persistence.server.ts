/**
 * @file Bookmark persistence operations
 * @module lib/bookmarks/persistence.server
 *
 * Primary store: PostgreSQL.
 */

import type { UnifiedBookmark } from "@/types/schemas/bookmark";

async function backfillBookmarkEmbeddingRows(
  bookmarks: UnifiedBookmark[],
  retryTransientFailures: boolean,
): Promise<void> {
  if (!process.env.AI_DEFAULT_EMBEDDING_MODEL?.trim()) return;

  const { backfillBookmarkEmbeddings } = await import("@/lib/db/mutations/bookmark-embeddings");
  const result = await backfillBookmarkEmbeddings({
    bookmarkIds: bookmarks.map((bookmark) => bookmark.id),
    maxRows: bookmarks.length,
    retryTransientFailures,
  });
  if (result.updatedRows > 0) {
    console.log(
      `[bookmarks/persistence] Updated ${result.updatedRows} bookmark embeddings using ${result.usedModel}.`,
    );
  }
}

/** Drain due embedding work only from the dedicated data-updater process. */
export async function backfillDueBookmarkEmbeddings(bookmarks: UnifiedBookmark[]): Promise<void> {
  if (process.env.IS_DATA_UPDATER !== "true") return;
  await backfillBookmarkEmbeddingRows(bookmarks, true);
}

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
  await backfillBookmarkEmbeddingRows(bookmarksWithSlugs, process.env.IS_DATA_UPDATER === "true");
}
