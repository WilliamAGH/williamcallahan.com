/**
 * Slug shard compatibility helpers.
 *
 * Legacy per-slug shard files have been retired. Bookmark slug lookups now
 * resolve directly from PostgreSQL while preserving the same helper API.
 *
 * @module lib/bookmarks/slug-shards
 */

import { getBookmarkBySlugFromDatabase } from "@/lib/db/queries/bookmarks";
import { envLogger } from "@/lib/utils/env-logger";
import type { BookmarkSlugEntry, BookmarkSlugMapping } from "@/types";

export const getSlugShardKey = (slug: string): string =>
  `db://bookmarks/slug/${encodeURIComponent(slug)}`;

export async function persistSlugShards(
  mapping: BookmarkSlugMapping,
  previous: BookmarkSlugMapping | null,
): Promise<void> {
  void mapping;
  void previous;
  envLogger.debug("Skipping slug shard persistence in PostgreSQL mode", undefined, {
    category: "SlugManager",
  });
}

export async function readSlugShard(slug: string): Promise<BookmarkSlugEntry | null> {
  if (slug.trim().length === 0) {
    return null;
  }

  const bookmark = await getBookmarkBySlugFromDatabase(slug);
  if (!bookmark) {
    return null;
  }

  return {
    id: bookmark.id,
    slug: bookmark.slug ?? slug,
    url: bookmark.url,
    title: bookmark.title || bookmark.url,
  };
}
