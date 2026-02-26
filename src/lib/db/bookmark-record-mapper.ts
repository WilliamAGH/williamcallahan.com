import type { BookmarkInsert, BookmarkRow } from "@/types/db/bookmarks";
import { unifiedBookmarkSchema, type UnifiedBookmark } from "@/types/schemas/bookmark";

const toUndefined = <T>(value: T | null): T | undefined => {
  if (value === null) {
    return undefined;
  }
  return value;
};

export function mapBookmarkRowToUnifiedBookmark(row: BookmarkRow): UnifiedBookmark {
  return unifiedBookmarkSchema.parse({
    id: row.id,
    url: row.url,
    title: row.title,
    description: row.description,
    slug: row.slug,
    tags: row.tags,
    ogImage: toUndefined(row.ogImage),
    dateBookmarked: row.dateBookmarked,
    datePublished: row.datePublished,
    dateCreated: toUndefined(row.dateCreated),
    dateUpdated: toUndefined(row.dateUpdated),
    modifiedAt: toUndefined(row.modifiedAt),
    archived: row.archived,
    taggingStatus: toUndefined(row.taggingStatus),
    note: row.note,
    summary: row.summary,
    content: toUndefined(row.content),
    assets: toUndefined(row.assets),
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
    registryLinks: toUndefined(row.registryLinks),
  });
}

export function mapBookmarkRowsToUnifiedBookmarks(rows: readonly BookmarkRow[]): UnifiedBookmark[] {
  return rows.map(mapBookmarkRowToUnifiedBookmark);
}

export function mapUnifiedBookmarkToBookmarkInsert(bookmark: UnifiedBookmark): BookmarkInsert {
  return {
    id: bookmark.id,
    slug: bookmark.slug,
    url: bookmark.url,
    title: bookmark.title,
    description: bookmark.description,
    note: bookmark.note ?? null,
    summary: bookmark.summary ?? null,
    tags: bookmark.tags,
    content: bookmark.content ?? null,
    assets: bookmark.assets ?? null,
    logoData: bookmark.logoData ?? null,
    registryLinks: bookmark.registryLinks ?? null,
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
    dateUpdated: bookmark.dateUpdated ?? null,
    modifiedAt: bookmark.modifiedAt ?? null,
    sourceUpdatedAt: bookmark.sourceUpdatedAt,
  };
}

export function mapUnifiedBookmarksToBookmarkInserts(
  bookmarks: readonly UnifiedBookmark[],
): BookmarkInsert[] {
  return bookmarks.map(mapUnifiedBookmarkToBookmarkInsert);
}
