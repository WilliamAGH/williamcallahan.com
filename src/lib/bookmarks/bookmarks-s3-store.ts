/**
 * S3-backed bookmark storage access
 *
 * Raw S3 reads and key parsing only. No caching, fallbacks, or external fetches.
 *
 * @module lib/bookmarks/bookmarks-s3-store
 */

import { BOOKMARKS_S3_PATHS } from "@/lib/constants";
import { readJsonS3, readJsonS3Optional } from "@/lib/s3/json";
import { listS3Objects } from "@/lib/s3/objects";
import { S3NotFoundError } from "@/lib/s3/errors";
import type { UnifiedBookmark } from "@/types";
import {
  bookmarksIndexSchema,
  unifiedBookmarkSchema,
  unifiedBookmarksArraySchema,
  type BookmarksIndex,
} from "@/types/bookmark";

const withS3NotFoundFallback = async <T>(readFn: () => Promise<T>): Promise<T | null> => {
  try {
    return await readFn();
  } catch (error: unknown) {
    if (error instanceof S3NotFoundError) return null;
    throw error;
  }
};

export async function readBookmarksDatasetFromS3(): Promise<UnifiedBookmark[] | null> {
  return withS3NotFoundFallback(() =>
    readJsonS3(BOOKMARKS_S3_PATHS.FILE, unifiedBookmarksArraySchema),
  );
}

export async function readBookmarksPageFromS3(
  pageNumber: number,
): Promise<UnifiedBookmark[] | null> {
  const key = `${BOOKMARKS_S3_PATHS.PAGE_PREFIX}${pageNumber}.json`;
  return withS3NotFoundFallback(() => readJsonS3(key, unifiedBookmarksArraySchema));
}

export async function readTagBookmarksPageFromS3(
  tagSlug: string,
  pageNumber: number,
): Promise<UnifiedBookmark[] | null> {
  const key = `${BOOKMARKS_S3_PATHS.TAG_PREFIX}${tagSlug}/page-${pageNumber}.json`;
  return withS3NotFoundFallback(() => readJsonS3(key, unifiedBookmarksArraySchema));
}

export async function readTagBookmarksIndexFromS3(tagSlug: string): Promise<BookmarksIndex | null> {
  return withS3NotFoundFallback(() =>
    readJsonS3Optional(
      `${BOOKMARKS_S3_PATHS.TAG_INDEX_PREFIX}${tagSlug}/index.json`,
      bookmarksIndexSchema,
    ),
  );
}

export async function readBookmarksIndexFromS3(): Promise<BookmarksIndex | null> {
  return withS3NotFoundFallback(() =>
    readJsonS3Optional(BOOKMARKS_S3_PATHS.INDEX, bookmarksIndexSchema),
  );
}

export async function readBookmarkByIdFromS3(bookmarkId: string): Promise<UnifiedBookmark | null> {
  return withS3NotFoundFallback(() =>
    readJsonS3Optional(`${BOOKMARKS_S3_PATHS.BY_ID_DIR}/${bookmarkId}.json`, unifiedBookmarkSchema),
  );
}

export async function listTagSlugsFromS3(): Promise<string[]> {
  const prefix = BOOKMARKS_S3_PATHS.TAG_INDEX_PREFIX;
  const keys = await listS3Objects(prefix);
  if (keys.length === 0) return [];

  const slugs = new Set<string>();
  for (const key of keys) {
    const normalized = key.startsWith(prefix) ? key.slice(prefix.length) : key;
    const match = normalized.match(/^([^/]+)\/index\.json$/);
    if (match && match[1]) {
      slugs.add(match[1]);
    }
  }

  return Array.from(slugs).toSorted();
}
