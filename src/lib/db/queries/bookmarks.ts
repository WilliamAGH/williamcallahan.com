import { asc, desc, eq, sql } from "drizzle-orm";
import { BOOKMARKS_PER_PAGE } from "@/lib/constants";
import {
  mapBookmarkRowToUnifiedBookmark,
  mapBookmarkRowsToUnifiedBookmarks,
} from "@/lib/db/bookmark-record-mapper";
import { db } from "@/lib/db/connection";
import {
  bookmarkIndexState,
  bookmarkTagIndexState,
  bookmarkTagLinks,
} from "@/lib/db/schema/bookmark-taxonomy";
import { bookmarks } from "@/lib/db/schema/bookmarks";
import { tagToSlug } from "@/lib/utils/tag-utils";
import type { BookmarkFtsSearchPageResult, BookmarkRow } from "@/types/db/bookmarks";
import type { BookmarksIndex, UnifiedBookmark } from "@/types/schemas/bookmark";

const GLOBAL_BOOKMARK_INDEX_STATE_ID = "global";

const assertPositiveInteger = (value: number, label: string): void => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer. Received: ${value}`);
  }
};

const assertNonEmptyString = (value: string, label: string): void => {
  if (value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
};

const mapBookmarkIndexStateToBookmarksIndex = (
  row: typeof bookmarkIndexState.$inferSelect | typeof bookmarkTagIndexState.$inferSelect,
): BookmarksIndex => ({
  count: row.count,
  totalPages: row.totalPages,
  pageSize: row.pageSize,
  lastModified: row.lastModified,
  lastFetchedAt: row.lastFetchedAt,
  lastAttemptedAt: row.lastAttemptedAt,
  checksum: row.checksum,
  changeDetected: row.changeDetected,
});

const buildFallbackIndex = (count: number, pageSize: number): BookmarksIndex => {
  const timestamp = Date.now();
  return {
    count,
    totalPages: Math.ceil(count / pageSize),
    pageSize,
    lastModified: new Date(timestamp).toISOString(),
    lastFetchedAt: timestamp,
    lastAttemptedAt: timestamp,
    checksum: `count:${count}`,
    changeDetected: false,
  };
};

export async function getAllBookmarkRows(): Promise<BookmarkRow[]> {
  return db.select().from(bookmarks).orderBy(desc(bookmarks.dateBookmarked), desc(bookmarks.id));
}

export async function getAllBookmarks(): Promise<UnifiedBookmark[]> {
  const rows = await getAllBookmarkRows();
  return mapBookmarkRowsToUnifiedBookmarks(rows);
}

export async function getBookmarkRowById(bookmarkId: string): Promise<BookmarkRow | null> {
  const rows = await db.select().from(bookmarks).where(eq(bookmarks.id, bookmarkId)).limit(1);
  const firstRow = rows[0];
  if (!firstRow) {
    return null;
  }
  return firstRow;
}

export async function getBookmarkById(bookmarkId: string): Promise<UnifiedBookmark | null> {
  const row = await getBookmarkRowById(bookmarkId);
  if (!row) {
    return null;
  }
  return mapBookmarkRowToUnifiedBookmark(row);
}

export async function getBookmarkRowBySlug(slug: string): Promise<BookmarkRow | null> {
  assertNonEmptyString(slug, "slug");
  const rows = await db.select().from(bookmarks).where(eq(bookmarks.slug, slug)).limit(1);
  const firstRow = rows[0];
  if (!firstRow) {
    return null;
  }
  return firstRow;
}

export async function getBookmarkBySlugFromDatabase(slug: string): Promise<UnifiedBookmark | null> {
  const row = await getBookmarkRowBySlug(slug);
  if (!row) {
    return null;
  }
  return mapBookmarkRowToUnifiedBookmark(row);
}

export async function getBookmarkIdBySlug(slug: string): Promise<string | null> {
  assertNonEmptyString(slug, "slug");
  const rows = await db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(eq(bookmarks.slug, slug))
    .limit(1);
  return rows[0]?.id ?? null;
}

export async function getSlugMappingRowsFromDatabase(): Promise<
  Array<{ id: string; slug: string; url: string; title: string }>
> {
  return db
    .select({
      id: bookmarks.id,
      slug: bookmarks.slug,
      url: bookmarks.url,
      title: bookmarks.title,
    })
    .from(bookmarks)
    .orderBy(asc(bookmarks.id));
}

export async function getBookmarksPage(
  pageNumber: number,
  pageSize: number,
): Promise<UnifiedBookmark[]> {
  assertPositiveInteger(pageNumber, "pageNumber");
  assertPositiveInteger(pageSize, "pageSize");

  const offset = (pageNumber - 1) * pageSize;
  const rows = await db
    .select()
    .from(bookmarks)
    .orderBy(desc(bookmarks.dateBookmarked), desc(bookmarks.id))
    .limit(pageSize)
    .offset(offset);
  return mapBookmarkRowsToUnifiedBookmarks(rows);
}

export async function getBookmarksPageByTag(
  tagSlug: string,
  pageNumber: number,
  pageSize: number,
): Promise<UnifiedBookmark[]> {
  assertPositiveInteger(pageNumber, "pageNumber");
  assertPositiveInteger(pageSize, "pageSize");

  const normalizedTagSlug = tagToSlug(tagSlug);
  if (normalizedTagSlug.length === 0) {
    return [];
  }

  const offset = (pageNumber - 1) * pageSize;
  const rows = await db
    .select({ bookmark: bookmarks })
    .from(bookmarkTagLinks)
    .innerJoin(bookmarks, eq(bookmarkTagLinks.bookmarkId, bookmarks.id))
    .where(eq(bookmarkTagLinks.tagSlug, normalizedTagSlug))
    .orderBy(desc(bookmarkTagLinks.dateBookmarked), desc(bookmarkTagLinks.bookmarkId))
    .limit(pageSize)
    .offset(offset);

  return mapBookmarkRowsToUnifiedBookmarks(rows.map((row) => row.bookmark));
}

export async function getBookmarksCount(): Promise<number> {
  const rows = await db.select({ count: sql<number>`count(*)::int` }).from(bookmarks);
  const row = rows[0];
  if (!row) {
    throw new Error("Failed to load bookmarks count: query returned no rows.");
  }
  return row.count;
}

export async function getBookmarksIndexFromDatabase(
  pageSize: number = BOOKMARKS_PER_PAGE,
): Promise<BookmarksIndex> {
  assertPositiveInteger(pageSize, "pageSize");

  const rows = await db
    .select()
    .from(bookmarkIndexState)
    .where(eq(bookmarkIndexState.id, GLOBAL_BOOKMARK_INDEX_STATE_ID))
    .limit(1);
  const stateRow = rows[0];
  if (stateRow) {
    return mapBookmarkIndexStateToBookmarksIndex(stateRow);
  }

  const count = await getBookmarksCount();
  return buildFallbackIndex(count, pageSize);
}

export async function getTagBookmarksIndexFromDatabase(
  tagSlug: string,
  pageSize: number = BOOKMARKS_PER_PAGE,
): Promise<BookmarksIndex | null> {
  assertPositiveInteger(pageSize, "pageSize");

  const normalizedTagSlug = tagToSlug(tagSlug);
  if (normalizedTagSlug.length === 0) {
    return null;
  }

  const rows = await db
    .select()
    .from(bookmarkTagIndexState)
    .where(eq(bookmarkTagIndexState.tagSlug, normalizedTagSlug))
    .limit(1);
  const stateRow = rows[0];
  if (stateRow) {
    return mapBookmarkIndexStateToBookmarksIndex(stateRow);
  }

  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookmarkTagLinks)
    .where(eq(bookmarkTagLinks.tagSlug, normalizedTagSlug));
  const count = countRows[0]?.count ?? 0;
  if (count === 0) {
    return null;
  }
  return buildFallbackIndex(count, pageSize);
}

export async function listTagSlugsFromDatabase(): Promise<string[]> {
  const stateRows = await db
    .select({ tagSlug: bookmarkTagIndexState.tagSlug })
    .from(bookmarkTagIndexState)
    .orderBy(asc(bookmarkTagIndexState.tagSlug));
  if (stateRows.length > 0) {
    return stateRows.map((row) => row.tagSlug);
  }

  const linkRows = await db
    .selectDistinct({ tagSlug: bookmarkTagLinks.tagSlug })
    .from(bookmarkTagLinks)
    .orderBy(asc(bookmarkTagLinks.tagSlug));
  return linkRows.map((row) => row.tagSlug);
}

export async function searchBookmarksFtsPage(
  query: string,
  pageNumber: number,
  pageSize: number,
): Promise<BookmarkFtsSearchPageResult> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length === 0) {
    return { items: [], totalCount: 0 };
  }

  assertPositiveInteger(pageNumber, "pageNumber");
  assertPositiveInteger(pageSize, "pageSize");
  const offset = (pageNumber - 1) * pageSize;
  const tsQuery = sql`websearch_to_tsquery('english', ${normalizedQuery})`;

  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookmarks)
    .where(sql`${bookmarks.searchVector} @@ ${tsQuery}`);

  const totalCount = countRows[0]?.count ?? 0;
  if (totalCount === 0) {
    return { items: [], totalCount: 0 };
  }

  const rows = await db
    .select({
      bookmark: bookmarks,
      score: sql<number>`ts_rank_cd(${bookmarks.searchVector}, ${tsQuery})`,
    })
    .from(bookmarks)
    .where(sql`${bookmarks.searchVector} @@ ${tsQuery}`)
    .orderBy(
      sql`ts_rank_cd(${bookmarks.searchVector}, ${tsQuery}) DESC`,
      desc(bookmarks.dateBookmarked),
      desc(bookmarks.id),
    )
    .limit(pageSize)
    .offset(offset);

  const items = rows.map((row) => ({
    bookmark: mapBookmarkRowToUnifiedBookmark(row.bookmark),
    score: Number(row.score),
  }));

  return { items, totalCount };
}

export async function searchBookmarksFts(
  query: string,
  limit: number = 50,
): Promise<UnifiedBookmark[]> {
  assertPositiveInteger(limit, "limit");
  const { items } = await searchBookmarksFtsPage(query, 1, limit);
  return items.map((item) => item.bookmark);
}
