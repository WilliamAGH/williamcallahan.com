/**
 * Books Related Content Reader Service
 * @module lib/books/related-content.server
 * @description
 * Server-side service for reading pre-computed related content for books.
 * Fetches data from S3 and provides type-safe access to related content entries.
 */

import { readJsonS3 } from "@/lib/s3-utils";
import { CONTENT_GRAPH_S3_PATHS } from "@/lib/constants";
import type { BooksRelatedContentData, RelatedContentEntry } from "@/types/related-content";

/**
 * Cached data and timestamp for in-memory caching
 */
let cachedData: BooksRelatedContentData | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours - matches generation frequency

/**
 * Ensure cached data is loaded and fresh, fetching from S3 if needed
 * @returns Cached data or null if unavailable
 */
async function ensureCacheLoaded(): Promise<BooksRelatedContentData | null> {
  const now = Date.now();
  if (cachedData && cacheTimestamp > now - CACHE_TTL_MS) {
    return cachedData;
  }

  try {
    const data = await readJsonS3<BooksRelatedContentData>(CONTENT_GRAPH_S3_PATHS.BOOKS_RELATED_CONTENT);
    if (data) {
      cachedData = data;
      cacheTimestamp = now;
      return data;
    }
  } catch (error) {
    console.error("[BooksRelatedContent] Failed to fetch from S3:", error);
  }
  return null;
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
  return Object.keys(data.entries).map(key => key.replace("book:", ""));
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
 * Clear the in-memory cache
 * Useful for testing or forcing a refresh
 */
export function clearBooksRelatedContentCache(): void {
  cachedData = null;
  cacheTimestamp = 0;
}
