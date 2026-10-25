import { asc, desc, eq, sql } from "drizzle-orm";
import { BOOKMARK_TAG_ALIAS_CTE } from "@/lib/db/bookmark-tag-aliases.mjs";
import { getLatestBookmarkLastModified } from "@/lib/bookmarks/content-dates";
import { BOOKMARKS_PER_PAGE } from "@/lib/constants";
import {
  mapBookmarkSelectToUnifiedBookmark,
  mapBookmarkSelectsToUnifiedBookmarks,
} from "@/lib/db/bookmark-record-mapper";
import { db } from "@/lib/db/connection";
import {
  bookmarkIndexState,
  bookmarkTagIndexState,
  bookmarkTagLinks,
  bookmarkTags,
} from "@/lib/db/schema/bookmark-taxonomy";
import { bookmarks } from "@/lib/db/schema/bookmarks";
import { tagToSlug } from "@/lib/utils/tag-utils";
import {
  BookmarkFtsSearchPageResult,
  BookmarkSelect,
  BookmarkTagResolution,
  BookmarkLightweightSelect,
} from "@/types/db/bookmarks";
import type { BookmarksIndex, UnifiedBookmark } from "@/types/schemas/bookmark";

const GLOBAL_BOOKMARK_INDEX_STATE_ID = "global";
const canonicalAliases = sql`(
  ${sql.raw(BOOKMARK_TAG_ALIAS_CTE)}
  SELECT source_tag_slug, target_tag_slug FROM canonical_tag_aliases
) AS canonical_alias`;
const canonicalTagSlug = sql<string>`coalesce(canonical_alias.target_tag_slug, ${bookmarkTags.tagSlug})`;

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

const buildFallbackIndex = (
  count: number,
  pageSize: number,
  lastModified: string | null,
): BookmarksIndex => {
  const timestamp = Date.now();
  return {
    count,
    totalPages: Math.ceil(count / pageSize),
    pageSize,
    lastModified: lastModified ?? "",
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
      canonicalSlug: canonicalTagSlug,
      canonicalTagName: sql<string>`coalesce(canonical_tag.tag_name, ${bookmarkTags.tagName})`,
    })
    .from(bookmarkTags)
    .leftJoin(canonicalAliases, sql`canonical_alias.source_tag_slug = ${bookmarkTags.tagSlug}`)
    .leftJoin(
      sql`bookmarks_tags AS canonical_tag`,
      sql`canonical_tag.tag_slug = ${canonicalTagSlug}`,
    )
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

  return {
    requestedSlug,
    canonicalSlug: tagRow.canonicalSlug,
    canonicalTagName: tagRow.canonicalTagName,
    isAlias: tagRow.canonicalSlug !== requestedSlug,
  };
}

/**
 * Essential columns for list views and ranking.
 * Excludes heavy fields: scrapedContentText, searchVector, assets.
 * Content is included as it contains screenshotAssetId needed for fallback rendering.
 */
export const lightweightBookmarkColumns = {
  id: bookmarks.id,
  slug: bookmarks.slug,
  url: bookmarks.url,
  title: bookmarks.title,
  description: bookmarks.description,
  note: bookmarks.note,
  summary: bookmarks.summary,
  tags: bookmarks.tags,
  content: bookmarks.content,
  logoData: bookmarks.logoData,
  ogImage: bookmarks.ogImage,
  ogTitle: bookmarks.ogTitle,
  ogDescription: bookmarks.ogDescription,
  ogUrl: bookmarks.ogUrl,
  ogImageExternal: bookmarks.ogImageExternal,
  ogImageLastFetchedAt: bookmarks.ogImageLastFetchedAt,
  ogImageEtag: bookmarks.ogImageEtag,
  readingTime: bookmarks.readingTime,
  wordCount: bookmarks.wordCount,
  taggingStatus: bookmarks.taggingStatus,
  domain: bookmarks.domain,
  dateBookmarked: bookmarks.dateBookmarked,
  datePublished: bookmarks.datePublished,
  dateCreated: bookmarks.dateCreated,
  modifiedAt: bookmarks.modifiedAt,
  sourceUpdatedAt: bookmarks.sourceUpdatedAt,
  archived: bookmarks.archived,
  isPrivate: bookmarks.isPrivate,
  isFavorite: bookmarks.isFavorite,
} as const;

const tagAliasJoinCondition = () =>
  sql`canonical_alias.source_tag_slug = ${bookmarkTagLinks.tagSlug}`;
const canonicalTagLinkSlug = sql<string>`coalesce(canonical_alias.target_tag_slug, ${bookmarkTagLinks.tagSlug})`;

// Compact date projections, not content/asset payloads; grouped once for all tags.
const memberContentDates = sql<
  Array<Pick<BookmarkSelect, "modifiedAt" | "dateCreated" | "dateBookmarked">>
>`
  jsonb_agg(DISTINCT jsonb_build_object(
    'modifiedAt', ${bookmarks.modifiedAt}, 'dateCreated', ${bookmarks.dateCreated},
    'dateBookmarked', ${bookmarks.dateBookmarked}
  ))`;

const tagLinkMatchesCanonicalSlug = (canonicalSlug: string) =>
  sql`${canonicalTagLinkSlug} = ${canonicalSlug}`;

async function getCanonicalTagContentState(canonicalSlug: string) {
  const countRows = await db
    .select({
      count: sql<number>`count(distinct ${bookmarkTagLinks.bookmarkId})::int`,
      contentDates: memberContentDates,
    })
    .from(bookmarkTagLinks)
    .leftJoin(canonicalAliases, tagAliasJoinCondition())
    .innerJoin(bookmarks, eq(bookmarks.id, bookmarkTagLinks.bookmarkId))
    .where(tagLinkMatchesCanonicalSlug(canonicalSlug));
  const row = countRows[0];
  return {
    count: row?.count ?? 0,
    lastModified: getLatestBookmarkLastModified(row?.contentDates ?? []),
  };
}

/**
 * Page counts for every canonical tag in one grouped query.
 * Partition semantics match getCanonicalTagContentState: each tag link
 * folds to its canonical slug via the alias map before counting, so the
 * totals agree with the per-tag index and page lookups. Dates come from
 * canonical member content, never an index rebuild/fetch timestamp.
 */
export async function listCanonicalTagPageCountsFromDatabase(
  pageSize: number = BOOKMARKS_PER_PAGE,
): Promise<Array<{ tagSlug: string; totalPages: number; lastModified: string | null }>> {
  assertPositiveInteger(pageSize, "pageSize");
  const rows = await db
    .select({
      tagSlug: canonicalTagLinkSlug,
      count: sql<number>`count(distinct ${bookmarkTagLinks.bookmarkId})::int`,
      contentDates: memberContentDates,
    })
    .from(bookmarkTagLinks)
    .leftJoin(canonicalAliases, tagAliasJoinCondition())
    .innerJoin(bookmarks, eq(bookmarks.id, bookmarkTagLinks.bookmarkId))
    .groupBy(canonicalTagLinkSlug);
  return rows.map((row) => ({
    tagSlug: row.tagSlug,
    totalPages: Math.ceil(row.count / pageSize),
    lastModified: getLatestBookmarkLastModified(row.contentDates),
  }));
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

export async function getSlugMappingRowsFromDatabase(
  executor: Pick<typeof db, "select"> = db,
): Promise<Array<{ id: string; slug: string; url: string; title: string }>> {
  return executor
    .select({
      id: bookmarks.id,
      slug: bookmarks.slug,
      url: bookmarks.url,
      title: bookmarks.title,
    })
    .from(bookmarks)
    .orderBy(asc(bookmarks.id));
}

/** One fixed-size-per-bookmark projection for sitemap URLs and content dates. */
export async function getBookmarkSitemapRowsFromDatabase() {
  return db
    .select({
      slug: bookmarks.slug,
      modifiedAt: bookmarks.modifiedAt,
      dateCreated: bookmarks.dateCreated,
      dateBookmarked: bookmarks.dateBookmarked,
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
  const rows = (await db
    .select(lightweightBookmarkColumns)
    .from(bookmarks)
    .orderBy(desc(bookmarks.dateBookmarked), desc(bookmarks.id))
    .limit(pageSize)
    .offset(offset)) as BookmarkLightweightSelect[];
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

  const matchingBookmarkIds = db
    .selectDistinctOn([bookmarkTagLinks.bookmarkId], {
      bookmarkId: bookmarkTagLinks.bookmarkId,
      dateBookmarked: bookmarkTagLinks.dateBookmarked,
    })
    .from(bookmarkTagLinks)
    .leftJoin(canonicalAliases, tagAliasJoinCondition())
    .where(tagLinkMatchesCanonicalSlug(resolution.canonicalSlug))
    .orderBy(bookmarkTagLinks.bookmarkId, desc(bookmarkTagLinks.dateBookmarked))
    .as("matching_bookmark_tag_links");

  const offset = (pageNumber - 1) * pageSize;
  const rows = (await db
    .select(lightweightBookmarkColumns)
    .from(matchingBookmarkIds)
    .innerJoin(bookmarks, eq(matchingBookmarkIds.bookmarkId, bookmarks.id))
    .orderBy(desc(matchingBookmarkIds.dateBookmarked), desc(matchingBookmarkIds.bookmarkId))
    .limit(pageSize)
    .offset(offset)) as BookmarkLightweightSelect[];

  return mapBookmarkSelectsToUnifiedBookmarks(rows);
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

  const contentRows = await getBookmarkSitemapRowsFromDatabase();
  return buildFallbackIndex(
    contentRows.length,
    pageSize,
    getLatestBookmarkLastModified(contentRows),
  );
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

  const stateRows = await db
    .select()
    .from(bookmarkTagIndexState)
    .where(eq(bookmarkTagIndexState.tagSlug, resolution.canonicalSlug))
    .limit(1);
  const { count, lastModified } = await getCanonicalTagContentState(resolution.canonicalSlug);
  if (count === 0) {
    return null;
  }
  const stateRow = stateRows[0];
  if (stateRow) {
    return {
      ...mapBookmarkIndexStateToBookmarksIndex(stateRow),
      lastModified: lastModified ?? "",
      count,
      totalPages: Math.ceil(count / pageSize),
      pageSize,
    };
  }
  return buildFallbackIndex(count, pageSize, lastModified);
}

export async function listTagSlugsFromDatabase(): Promise<string[]> {
  const tagRows = await db
    .selectDistinct({ tagSlug: canonicalTagSlug })
    .from(bookmarkTags)
    .leftJoin(canonicalAliases, sql`canonical_alias.source_tag_slug = ${bookmarkTags.tagSlug}`)
    .orderBy(asc(canonicalTagSlug));
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
    score: row.score,
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
