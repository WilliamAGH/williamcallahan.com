/**
 * Books Related Content Reader Service
 * @module lib/books/related-content.server
 * @description
 * Server-side service for reading pre-computed related content for books.
 * Fetches data from PostgreSQL and provides type-safe access to related content entries.
 */

import { readBooksRelatedContent } from "@/lib/db/queries/content-graph";
import { envLogger } from "@/lib/utils/env-logger";
import { cacheContextGuards, USE_NEXTJS_CACHE, withCacheFallback } from "@/lib/cache";
import type { BooksRelatedContent } from "@/types/schemas/book";
import type { RelatedContentEntry } from "@/types/schemas/related-content";

const CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours - matches generation frequency

/**
 * Load related content dataset from PostgreSQL.
 * Returns null when not available and logs infrastructure failures.
 */
async function loadRelatedContentDirect(): Promise<BooksRelatedContent | null> {
  try {
    return await readBooksRelatedContent();
  } catch (error) {
    envLogger.log(
      "Failed to fetch books related content from database",
      { error: error instanceof Error ? error.message : String(error) },
      { category: "BooksRelatedContent" },
    );
  }
  return null;
}

async function loadRelatedContentCached(): Promise<BooksRelatedContent | null> {
  "use cache";
  cacheContextGuards.cacheLife("BooksRelatedContent", { revalidate: CACHE_TTL_SECONDS });
  cacheContextGuards.cacheTag("BooksRelatedContent", "books-related-content");
  return loadRelatedContentDirect();
}

async function ensureCacheLoaded(): Promise<BooksRelatedContent | null> {
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
  const relatedContentCache = await ensureCacheLoaded();
  return relatedContentCache?.entries[`book:${bookId}`] ?? [];
}

/**
 * Get all book IDs that have pre-computed related content
 * @returns Array of book IDs
 */
export async function getBookIdsWithRelatedContent(): Promise<string[]> {
  const relatedContentCache = await ensureCacheLoaded();
  if (!relatedContentCache) return [];
  return Object.keys(relatedContentCache.entries).map((key) => key.replace("book:", ""));
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
  const relatedContentCache = await ensureCacheLoaded();
  if (!relatedContentCache) return null;
  return {
    version: relatedContentCache.version,
    generated: relatedContentCache.generated,
    booksCount: relatedContentCache.booksCount,
  };
}

/**
 * Invalidate the books-related-content cache tag.
 */
export function clearBooksRelatedContentCache(): void {
  cacheContextGuards.revalidateTag("BooksRelatedContent", "books-related-content");
}
