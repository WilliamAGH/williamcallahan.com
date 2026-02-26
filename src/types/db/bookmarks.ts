import type { bookmarks } from "@/lib/db/schema/bookmarks";
import type { UnifiedBookmark } from "@/types/schemas/bookmark";

export type BookmarkRow = typeof bookmarks.$inferSelect;
export type BookmarkInsert = typeof bookmarks.$inferInsert;

export type BookmarkFtsSearchHit = {
  bookmark: UnifiedBookmark;
  score: number;
};

export type BookmarkFtsSearchPageResult = {
  items: BookmarkFtsSearchHit[];
  totalCount: number;
};
