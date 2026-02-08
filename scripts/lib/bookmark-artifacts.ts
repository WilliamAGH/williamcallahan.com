/**
 * Bookmark artifact builders for local S3 cache population.
 * Builds pagination and tag-based artifacts from raw bookmark data.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { normalizeTagsToStrings, tagToSlug } from "@/lib/utils/tag-utils";
import type { BookmarkS3Record, BookmarkSlugMapping } from "@/types/bookmark";

/** Default number of bookmarks per paginated page */
const DEFAULT_BOOKMARKS_PAGE_SIZE = 24;

const LOCAL_S3_BASE =
  process.env.LOCAL_S3_CACHE_DIR?.trim() || join(process.cwd(), ".next", "cache", "local-s3");

export function saveToLocalS3(key: string, data: unknown): void {
  const fullPath = join(LOCAL_S3_BASE, key);
  const dir = dirname(fullPath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, JSON.stringify(data, null, 2));
  console.log(`   📦 Cached ${key} locally (${fullPath})`);
}

function embedSlug(
  bookmark: BookmarkS3Record,
  slugMapping: Partial<BookmarkSlugMapping> | null,
): BookmarkS3Record {
  if (bookmark.slug) return bookmark;
  const id = typeof bookmark.id === "string" ? bookmark.id : null;
  if (!id) return bookmark;
  const slug = slugMapping?.slugs?.[id]?.slug;
  return slug ? { ...bookmark, slug } : bookmark;
}

/**
 * Compute a checksum from raw BookmarkS3Record data.
 * Uses only `id` and modification timestamps — mirrors the algorithm in
 * `src/lib/bookmarks/utils.ts#calculateBookmarksChecksum` but is typed for
 * the looser `BookmarkS3Record` shape used in build scripts.
 */
function toStringField(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function computeChecksum(bookmarks: BookmarkS3Record[]): string {
  return [...bookmarks]
    .toSorted((a, b) => (a.id ?? "").localeCompare(b.id ?? ""))
    .map((b) => `${b.id}:${toStringField(b.modifiedAt) || toStringField(b.dateBookmarked)}`)
    .join("|");
}

export function buildPaginationArtifacts(
  rawBookmarks: unknown,
  slugMapping: Partial<BookmarkSlugMapping> | null,
  index: unknown,
  pagePrefix: string,
): void {
  if (!Array.isArray(rawBookmarks) || rawBookmarks.length === 0) return;
  let pageSize = DEFAULT_BOOKMARKS_PAGE_SIZE;
  if (typeof index === "object" && index !== null && "pageSize" in index) {
    const rawPageSize = (index as Record<string, unknown>).pageSize;
    if (typeof rawPageSize === "number" && rawPageSize > 0) {
      pageSize = rawPageSize;
    }
  }
  const bookmarks = rawBookmarks.map((b) => embedSlug(b as BookmarkS3Record, slugMapping));
  const totalPages = Math.max(1, Math.ceil(bookmarks.length / pageSize));
  for (let page = 1; page <= totalPages; page++) {
    const start = (page - 1) * pageSize;
    const slice = bookmarks.slice(start, start + pageSize);
    saveToLocalS3(`${pagePrefix}${page}.json`, slice);
  }
}

export function buildTagArtifacts(
  rawBookmarks: unknown,
  slugMapping: Partial<BookmarkSlugMapping> | null,
  tagPrefix: string,
  tagIndexPrefix: string,
): void {
  if (!Array.isArray(rawBookmarks) || rawBookmarks.length === 0) return;
  const tagBuckets = new Map<string, BookmarkS3Record[]>();
  rawBookmarks.forEach((item) => {
    const bookmark = embedSlug(item as BookmarkS3Record, slugMapping);
    const tagNames = normalizeTagsToStrings((bookmark.tags as Array<string>) || []);
    tagNames.forEach((tagName) => {
      const slug = tagToSlug(tagName);
      if (!slug) return;
      if (!tagBuckets.has(slug)) tagBuckets.set(slug, []);
      tagBuckets.get(slug)?.push(bookmark);
    });
  });

  const pageSize = DEFAULT_BOOKMARKS_PAGE_SIZE;
  const timestamp = Date.now();
  tagBuckets.forEach((bookmarks, slug) => {
    const totalPages = Math.max(1, Math.ceil(bookmarks.length / pageSize));
    const indexPayload = {
      count: bookmarks.length,
      totalPages,
      pageSize,
      lastModified: new Date().toISOString(),
      lastFetchedAt: timestamp,
      lastAttemptedAt: timestamp,
      checksum: computeChecksum(bookmarks),
      changeDetected: true,
    };
    saveToLocalS3(`${tagIndexPrefix}${slug}/index.json`, indexPayload);
    for (let page = 1; page <= totalPages; page++) {
      const start = (page - 1) * pageSize;
      const slice = bookmarks.slice(start, start + pageSize);
      saveToLocalS3(`${tagPrefix}${slug}/page-${page}.json`, slice);
    }
  });
}
