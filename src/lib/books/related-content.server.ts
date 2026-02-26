/**
 * Books Related Content Reader Service
 * @module lib/books/related-content.server
 * @description
 * Server-side service for reading pre-computed related content for books.
 * Fetches data from S3 and provides type-safe access to related content entries.
 */

import { readJsonS3Optional } from "@/lib/s3/json";
import { CONTENT_GRAPH_S3_PATHS } from "@/lib/constants";
import { envLogger } from "@/lib/utils/env-logger";
import { cacheContextGuards, USE_NEXTJS_CACHE, withCacheFallback } from "@/lib/cache";
import { booksRelatedContentDataSchema } from "@/types/schemas/book";
import type { BooksRelatedContentData, RelatedContentEntry } from "@/types/related-content";

const CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours - matches generation frequency

/**
 * Load related content dataset from S3.
 * Returns null when not available and logs infrastructure failures.
 */
async function loadRelatedContentDirect(): Promise<BooksRelatedContentData | null> {
  try {
    return await readJsonS3Optional(
      CONTENT_GRAPH_S3_PATHS.BOOKS_RELATED_CONTENT,
      booksRelatedContentDataSchema,
    );
  } catch (error) {
    envLogger.log(
      "Failed to fetch books related content from S3",
      { error: error instanceof Error ? error.message : String(error) },
      { category: "BooksRelatedContent" },
    );
  }
  return null;
}

async function loadRelatedContentCached(): Promise<BooksRelatedContentData | null> {
  "use cache";
  cacheContextGuards.cacheLife("BooksRelatedContent", { revalidate: CACHE_TTL_SECONDS });
  cacheContextGuards.cacheTag("BooksRelatedContent", "books-related-content");
  return loadRelatedContentDirect();
}

async function ensureCacheLoaded(): Promise<BooksRelatedContentData | null> {
  if (!USE_NEXTJS_CACHE) {
    return loadRelatedContentDirect();
  }
  return withCacheFallback(
    () => loadRelatedContentCached(),
    () => loadRelatedContentDirect(),
  );
}

/**
 * Get pre-computed related content for a book
 * @param bookId - The book ID to lookup
 * @returns Array of related content entries, or empty array if not found
 */
export async function getRelatedContentForBook(bookId: string): Promise<RelatedContentEntry[]> {
  const data = await ensureCacheLoaded();
  return data?.entries[`book:${bookId}`] ?? [];
}

/**
 * Get all book IDs that have pre-computed related content
 * @returns Array of book IDs
 */
export async function getBookIdsWithRelatedContent(): Promise<string[]> {
  const data = await ensureCacheLoaded();
  if (!data) return [];
  return Object.keys(data.entries).map((key) => key.replace("book:", ""));
}

/**
 * Get metadata about the pre-computed related content
 * @returns Metadata object or null if not available
 */
export async function getBooksRelatedContentMetadata(): Promise<{
  version: string;
  generated: string;
  booksCount: number;
} | null> {
  const data = await ensureCacheLoaded();
  if (!data) return null;
  return {
    version: data.version,
    generated: data.generated,
    booksCount: data.booksCount,
  };
}

/**
 * Invalidate the books-related-content cache tag.
 */
export function clearBooksRelatedContentCache(): void {
  cacheContextGuards.revalidateTag("BooksRelatedContent", "books-related-content");
}
