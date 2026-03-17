import { and, asc, desc, eq, sql } from "drizzle-orm";
import { BOOKMARKS_PER_PAGE } from "@/lib/constants";
import {
  mapBookmarkSelectToUnifiedBookmark,
  mapBookmarkSelectsToUnifiedBookmarks,
} from "@/lib/db/bookmark-record-mapper";
import { db } from "@/lib/db/connection";
import {
  bookmarkIndexState,
  bookmarkTagAliasLinks,
  bookmarkTagIndexState,
  bookmarkTagLinks,
  bookmarkTags,
} from "@/lib/db/schema/bookmark-taxonomy";
import { bookmarks } from "@/lib/db/schema/bookmarks";
import { tagToSlug } from "@/lib/utils/tag-utils";
import type {
  BookmarkFtsSearchPageResult,
  BookmarkSelect,
  BookmarkTagResolution,
} from "@/types/db/bookmarks";
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

async function resolveCanonicalTagSlugInternal(tagSlug: string): Promise<BookmarkTagResolution> {
  const requestedSlug = tagToSlug(tagSlug);
  if (requestedSlug.length === 0) {
    return {
      requestedSlug: "",
      canonicalSlug: "",
      canonicalTagName: null,
      isAlias: false,
    };
  }

  const tagRows = await db
    .select({
      tagSlug: bookmarkTags.tagSlug,
      tagName: bookmarkTags.tagName,
      tagStatus: bookmarkTags.tagStatus,
    })
    .from(bookmarkTags)
    .where(eq(bookmarkTags.tagSlug, requestedSlug))
    .limit(1);
  const tagRow = tagRows[0];

  if (!tagRow) {
    return {
      requestedSlug,
      canonicalSlug: requestedSlug,
      canonicalTagName: null,
      isAlias: false,
    };
  }

  if (tagRow.tagStatus !== "alias") {
    return {
      requestedSlug,
      canonicalSlug: requestedSlug,
      canonicalTagName: tagRow.tagName,
      isAlias: false,
    };
  }

  const aliasRows = await db
    .select({
      canonicalSlug: bookmarkTagAliasLinks.targetTagSlug,
      canonicalTagName: bookmarkTags.tagName,
    })
    .from(bookmarkTagAliasLinks)
    .innerJoin(bookmarkTags, eq(bookmarkTags.tagSlug, bookmarkTagAliasLinks.targetTagSlug))
    .where(
      and(
        eq(bookmarkTagAliasLinks.sourceTagSlug, requestedSlug),
        eq(bookmarkTagAliasLinks.linkType, "alias"),
      ),
    )
    .limit(1);
  const aliasRow = aliasRows[0];

  if (!aliasRow) {
    return {
      requestedSlug,
      canonicalSlug: requestedSlug,
      canonicalTagName: tagRow.tagName,
      isAlias: false,
    };
  }

  return {
    requestedSlug,
    canonicalSlug: aliasRow.canonicalSlug,
    canonicalTagName: aliasRow.canonicalTagName,
    isAlias: aliasRow.canonicalSlug !== requestedSlug,
  };
}

export async function resolveCanonicalTagSlug(tagSlug: string): Promise<BookmarkTagResolution> {
  return resolveCanonicalTagSlugInternal(tagSlug);
}

export async function getAllBookmarkSelects(): Promise<BookmarkSelect[]> {
  return db.select().from(bookmarks).orderBy(desc(bookmarks.dateBookmarked), desc(bookmarks.id));
}

export async function getAllBookmarks(): Promise<UnifiedBookmark[]> {
  const rows = await getAllBookmarkSelects();
  return mapBookmarkSelectsToUnifiedBookmarks(rows);
}

export async function getBookmarkSelectById(bookmarkId: string): Promise<BookmarkSelect | null> {
  const rows = await db.select().from(bookmarks).where(eq(bookmarks.id, bookmarkId)).limit(1);
  const firstRow = rows[0];
  if (!firstRow) {
    return null;
  }
  return firstRow;
}

export async function getBookmarkById(bookmarkId: string): Promise<UnifiedBookmark | null> {
  const row = await getBookmarkSelectById(bookmarkId);
  if (!row) {
    return null;
  }
  return mapBookmarkSelectToUnifiedBookmark(row);
}

export async function getBookmarkSelectBySlug(slug: string): Promise<BookmarkSelect | null> {
  assertNonEmptyString(slug, "slug");
  const rows = await db.select().from(bookmarks).where(eq(bookmarks.slug, slug)).limit(1);
  const firstRow = rows[0];
  if (!firstRow) {
    return null;
  }
  return firstRow;
}

export async function getBookmarkBySlugFromDatabase(slug: string): Promise<UnifiedBookmark | null> {
  const row = await getBookmarkSelectBySlug(slug);
  if (!row) {
    return null;
  }
  return mapBookmarkSelectToUnifiedBookmark(row);
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
  return mapBookmarkSelectsToUnifiedBookmarks(rows);
}

export async function getBookmarksPageByTag(
  tagSlug: string,
  pageNumber: number,
  pageSize: number,
): Promise<UnifiedBookmark[]> {
  assertPositiveInteger(pageNumber, "pageNumber");
  assertPositiveInteger(pageSize, "pageSize");

  const resolution = await resolveCanonicalTagSlugInternal(tagSlug);
  if (resolution.canonicalSlug.length === 0) {
    return [];
  }

  const offset = (pageNumber - 1) * pageSize;
  const rows = await db
    .select({ bookmark: bookmarks })
    .from(bookmarkTagLinks)
    .innerJoin(bookmarks, eq(bookmarkTagLinks.bookmarkId, bookmarks.id))
    .where(eq(bookmarkTagLinks.tagSlug, resolution.canonicalSlug))
    .orderBy(desc(bookmarkTagLinks.dateBookmarked), desc(bookmarkTagLinks.bookmarkId))
    .limit(pageSize)
    .offset(offset);

  return mapBookmarkSelectsToUnifiedBookmarks(rows.map((row) => row.bookmark));
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

  const resolution = await resolveCanonicalTagSlugInternal(tagSlug);
  if (resolution.canonicalSlug.length === 0) {
    return null;
  }

  const rows = await db
    .select()
    .from(bookmarkTagIndexState)
    .where(eq(bookmarkTagIndexState.tagSlug, resolution.canonicalSlug))
    .limit(1);
  const stateRow = rows[0];
  if (stateRow) {
    return mapBookmarkIndexStateToBookmarksIndex(stateRow);
  }

  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookmarkTagLinks)
    .where(eq(bookmarkTagLinks.tagSlug, resolution.canonicalSlug));
  const count = countRows[0]?.count ?? 0;
  if (count === 0) {
    return null;
  }
  return buildFallbackIndex(count, pageSize);
}

export async function listTagSlugsFromDatabase(): Promise<string[]> {
  const tagRows = await db
    .select({ tagSlug: bookmarkTags.tagSlug })
    .from(bookmarkTags)
    .where(eq(bookmarkTags.tagStatus, "primary"))
    .orderBy(asc(bookmarkTags.tagSlug));
  return tagRows.map((row) => row.tagSlug);
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
    bookmark: mapBookmarkSelectToUnifiedBookmark(row.bookmark),
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
