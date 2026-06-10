import type { BookmarkInsert, BookmarkRef } from "@/types/db/bookmarks";
import { unifiedBookmarkSchema, type UnifiedBookmark } from "@/types/schemas/bookmark";

/**
 * Canonical list of bookmark fields owned by enrichment/backfill pipelines
 * (OpenGraph, logos, computed fields, scraped content) rather than the
 * Karakeep source payload. Consumers must bind this list instead of
 * restating it: the upsert preserves these columns via COALESCE and the
 * refresh pipeline hydrates them from prior rows before re-enrichment.
 */
export const BOOKMARK_ENRICHMENT_FIELDS = [
  "ogImage",
  "ogTitle",
  "ogDescription",
  "ogUrl",
  "ogImageExternal",
  "ogImageLastFetchedAt",
  "ogImageEtag",
  "logoData",
  "readingTime",
  "wordCount",
  "scrapedContentText",
] as const satisfies ReadonlyArray<keyof UnifiedBookmark & keyof BookmarkInsert>;

const toUndefined = <T>(value: T | null): T | undefined => {
  if (value === null) {
    return undefined;
  }
  return value;
};

/**
 * Convert a nullable string to a servable image URL or undefined.
 * Accepts absolute URLs and app-relative /api/assets/<id> proxy URLs persisted
 * by the web runtime; drops anything else.
 */
const toUrlOrUndefined = (value: string | null): string | undefined => {
  if (!value) return undefined;
  if (value.startsWith("/api/assets/")) return value;
  if (!URL.canParse(value)) return undefined;
  const parsed = new URL(value);
  return parsed.protocol === "http:" || parsed.protocol === "https:" ? value : undefined;
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
  const parsedBookmark = unifiedBookmarkSchema.parse({ ...bookmark, slug: normalizedSlug });

  return {
    id: parsedBookmark.id,
    slug: normalizedSlug,
    url: parsedBookmark.url,
    title: parsedBookmark.title,
    description: parsedBookmark.description,
    note: parsedBookmark.note ?? null,
    summary: parsedBookmark.summary ?? null,
    scrapedContentText: parsedBookmark.scrapedContentText ?? null,
    tags: parsedBookmark.tags,
    content: parsedBookmark.content ?? null,
    assets: parsedBookmark.assets ?? null,
    logoData: parsedBookmark.logoData ?? null,
    ogImage: parsedBookmark.ogImage ?? null,
    ogTitle: parsedBookmark.ogTitle ?? null,
    ogDescription: parsedBookmark.ogDescription ?? null,
    ogUrl: parsedBookmark.ogUrl ?? null,
    ogImageExternal: parsedBookmark.ogImageExternal ?? null,
    ogImageLastFetchedAt: parsedBookmark.ogImageLastFetchedAt ?? null,
    ogImageEtag: parsedBookmark.ogImageEtag ?? null,
    readingTime: parsedBookmark.readingTime ?? null,
    wordCount: parsedBookmark.wordCount ?? null,
    archived: parsedBookmark.archived === true,
    isPrivate: parsedBookmark.isPrivate === true,
    isFavorite: parsedBookmark.isFavorite === true,
    taggingStatus: parsedBookmark.taggingStatus ?? null,
    domain: parsedBookmark.domain ?? null,
    dateBookmarked: parsedBookmark.dateBookmarked,
    datePublished: parsedBookmark.datePublished ?? null,
    dateCreated: parsedBookmark.dateCreated ?? null,
    modifiedAt: parsedBookmark.modifiedAt ?? null,
    sourceUpdatedAt: parsedBookmark.sourceUpdatedAt,
  };
}

export function mapUnifiedBookmarksToBookmarkInserts(
  bookmarks: readonly UnifiedBookmark[],
): BookmarkInsert[] {
  return bookmarks.map(mapUnifiedBookmarkToBookmarkInsert);
}
