import type { BookmarkInsert, BookmarkRef } from "@/types/db/bookmarks";
import { unifiedBookmarkSchema, type UnifiedBookmark } from "@/types/schemas/bookmark";

const toUndefined = <T>(value: T | null): T | undefined => {
  if (value === null) {
    return undefined;
  }
  return value;
};

/** Convert a nullable string to a valid URL or undefined. Silently drops non-URL values. */
const toUrlOrUndefined = (value: string | null): string | undefined => {
  if (!value) return undefined;
  return URL.canParse(value) ? value : undefined;
};

const SLUG_SANITIZE_PATTERN = /[^a-z0-9]+/gi;
const SLUG_EDGE_DASH_PATTERN = /(^-+|-+$)/g;
const FALLBACK_SLUG_ID_PREFIX_LENGTH = 8;

const generateDeterministicFallbackSlug = (url: string, id: string): string => {
  const normalizedBase = url
    .replace(SLUG_SANITIZE_PATTERN, "-")
    .toLowerCase()
    .replace(SLUG_EDGE_DASH_PATTERN, "");
  const base = normalizedBase.length > 0 ? normalizedBase : "bookmark";
  return `${base}-${id.slice(0, FALLBACK_SLUG_ID_PREFIX_LENGTH)}`;
};

const resolveRowSlug = (row: Pick<BookmarkRef, "id" | "slug" | "url">): string => {
  const normalizedSlug = row.slug.trim();
  if (normalizedSlug.length > 0) {
    return normalizedSlug;
  }

  const repairedSlug = generateDeterministicFallbackSlug(row.url, row.id);
  console.error(
    `[BookmarkMapper] Repaired empty slug for bookmark ${row.id}; using fallback slug ${repairedSlug}.`,
  );
  return repairedSlug;
};

export function mapBookmarkSelectToUnifiedBookmark(row: BookmarkRef): UnifiedBookmark {
  // Use 'in' operator to safely check for existence of optional/heavy fields
  // to satisfy structural type safety requirements [TS1]
  const hasFullData = "scrapedContentText" in row;

  return unifiedBookmarkSchema.parse({
    id: row.id,
    url: row.url,
    title: row.title,
    description: row.description,
    slug: resolveRowSlug(row),
    tags: row.tags,
    ogImage: toUrlOrUndefined(row.ogImage),
    dateBookmarked: row.dateBookmarked,
    datePublished: row.datePublished,
    dateCreated: toUndefined(row.dateCreated),
    modifiedAt: toUndefined(row.modifiedAt),
    archived: row.archived,
    taggingStatus: toUndefined(row.taggingStatus),
    note: row.note,
    summary: row.summary,
    scrapedContentText: hasFullData ? toUndefined(row.scrapedContentText) : undefined,
    content: toUndefined(row.content),
    assets: hasFullData ? toUndefined(row.assets) : undefined,
    logoData: row.logoData,
    readingTime: toUndefined(row.readingTime),
    wordCount: toUndefined(row.wordCount),
    ogTitle: row.ogTitle,
    ogDescription: row.ogDescription,
    ogUrl: row.ogUrl,
    domain: toUndefined(row.domain),
    sourceUpdatedAt: row.sourceUpdatedAt,
    ogImageLastFetchedAt: toUndefined(row.ogImageLastFetchedAt),
    ogImageEtag: toUndefined(row.ogImageEtag),
    isPrivate: row.isPrivate,
    isFavorite: row.isFavorite,
    ogImageExternal: toUndefined(row.ogImageExternal),
  });
}

export function mapBookmarkSelectsToUnifiedBookmarks(
  rows: readonly BookmarkRef[],
): UnifiedBookmark[] {
  return rows.map(mapBookmarkSelectToUnifiedBookmark);
}

export function mapUnifiedBookmarkToBookmarkInsert(bookmark: UnifiedBookmark): BookmarkInsert {
  const normalizedSlug = bookmark.slug.trim();
  if (normalizedSlug.length === 0) {
    throw new Error(`[BookmarkMapper] Cannot persist bookmark ${bookmark.id} with an empty slug.`);
  }

  return {
    id: bookmark.id,
    slug: normalizedSlug,
    url: bookmark.url,
    title: bookmark.title,
    description: bookmark.description,
    note: bookmark.note ?? null,
    summary: bookmark.summary ?? null,
    scrapedContentText: bookmark.scrapedContentText ?? null,
    tags: bookmark.tags,
    content: bookmark.content ?? null,
    assets: bookmark.assets ?? null,
    logoData: bookmark.logoData ?? null,
    ogImage: bookmark.ogImage ?? null,
    ogTitle: bookmark.ogTitle ?? null,
    ogDescription: bookmark.ogDescription ?? null,
    ogUrl: bookmark.ogUrl ?? null,
    ogImageExternal: bookmark.ogImageExternal ?? null,
    ogImageLastFetchedAt: bookmark.ogImageLastFetchedAt ?? null,
    ogImageEtag: bookmark.ogImageEtag ?? null,
    readingTime: bookmark.readingTime ?? null,
    wordCount: bookmark.wordCount ?? null,
    archived: bookmark.archived === true,
    isPrivate: bookmark.isPrivate === true,
    isFavorite: bookmark.isFavorite === true,
    taggingStatus: bookmark.taggingStatus ?? null,
    domain: bookmark.domain ?? null,
    dateBookmarked: bookmark.dateBookmarked,
    datePublished: bookmark.datePublished ?? null,
    dateCreated: bookmark.dateCreated ?? null,
    modifiedAt: bookmark.modifiedAt ?? null,
    sourceUpdatedAt: bookmark.sourceUpdatedAt,
  };
}

export function mapUnifiedBookmarksToBookmarkInserts(
  bookmarks: readonly UnifiedBookmark[],
): BookmarkInsert[] {
  return bookmarks.map(mapUnifiedBookmarkToBookmarkInsert);
}
