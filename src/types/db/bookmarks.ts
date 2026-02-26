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

/** Row shape for embedding backfill queries (subset of bookmark columns). */
export type BookmarkEmbeddingRow = {
  id: string;
  url: string;
  title: string;
  description: string;
  summary: string | null;
  note: string | null;
  domain: string | null;
  tags: unknown;
};

export type BookmarkEmbeddingBackfillOptions = {
  batchSize?: number;
  maxRows?: number;
  bookmarkIds?: string[];
  dryRun?: boolean;
};

export type BookmarkEmbeddingBackfillResult = {
  processedRows: number;
  updatedRows: number;
  remainingRows: number;
  usedModel: string;
  dryRun: boolean;
};
