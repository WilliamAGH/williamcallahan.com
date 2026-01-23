/**
 * Chroma Sync Operations for Books
 * @module lib/books/chroma-sync
 *
 * Provides sync operations between book uploads and Chroma vector store.
 * Books are chunked into smaller segments for optimal semantic search.
 *
 * Key design decisions:
 * - Separate "books" collection from other content types
 * - Each chunk is a document with book metadata
 * - Document ID format: {bookId}_{chunkIndex} for easy batch operations
 * - Metadata includes chapter info for context-aware retrieval
 */

import { getChromaClient } from "@/lib/chroma/client";
import { EmbeddingFunctionError } from "@/lib/chroma/embedding-error";
import { getEmbeddingFunction } from "@/lib/chroma/embedding-function";
import type { Collection, Metadata, Where } from "chromadb";
import type {
  TextChunk,
  EpubMetadata,
  BookChunkMetadata,
  BookIndexData,
  BookIndexResult,
  BookSearchResult,
  BookSearchHit,
} from "@/types/books/parsing";

// =============================================================================
// COLLECTION MANAGEMENT
// =============================================================================

/** Collection name for books in Chroma */
const COLLECTION_NAME = "books";

/** Collection metadata version - increment when schema changes require re-embedding */
const COLLECTION_VERSION = "2";

// =============================================================================
// METADATA HELPERS
// =============================================================================

/**
 * Parse comma-separated string back into array
 * Used for subjects and other array fields stored as strings in Chroma
 */
export function parseChromaArray(value: string | undefined | null): string[] {
  if (!value) return [];
  return value.split(",").filter(s => s.trim().length > 0);
}

/**
 * Gets or creates the books collection with standard configuration.
 * Uses the DefaultEmbeddingFunction for local ONNX-based embeddings.
 *
 * @returns Configured books collection
 */
export async function getBooksCollection(): Promise<Collection> {
  const client = getChromaClient();
  const ef = await getEmbeddingFunction();
  return client.getOrCreateCollection({
    name: COLLECTION_NAME,
    metadata: {
      description: "Book content chunks for semantic search and RAG",
      contentType: "book-chunk",
      version: COLLECTION_VERSION,
    },
    embeddingFunction: ef,
  });
}

// =============================================================================
// INDEXING OPERATIONS
// =============================================================================

/**
 * Generate document ID for a book chunk
 */
function generateChunkId(bookId: string, chunkIndex: number): string {
  return `${bookId}_chunk_${chunkIndex.toString().padStart(5, "0")}`;
}

/**
 * Convert chunk to Chroma metadata format
 * Arrays are serialized as comma-separated strings (Chroma limitation)
 */
function toChromaMetadata(
  bookId: string,
  metadata: EpubMetadata,
  chunk: TextChunk,
  totalChunks: number,
  fileType: string,
): BookChunkMetadata {
  return {
    bookId,
    title: metadata.title,
    author: metadata.author,
    isbn: metadata.isbn ?? "",
    fileType,
    chapterId: chunk.chapterId ?? "",
    chapterTitle: chunk.chapterTitle ?? "",
    chunkIndex: chunk.index,
    totalChunks,
    wordCount: chunk.wordCount,
    contentType: "book-chunk",
    indexedAt: new Date().toISOString(),
    // Extended metadata - arrays serialized as comma-separated strings
    subjects: metadata.subjects?.join(",") ?? "",
    publisher: metadata.publisher ?? "",
    publishedDate: metadata.date ?? "",
    language: metadata.language ?? "",
    series: metadata.series ?? "",
    seriesIndex: metadata.seriesIndex?.toString() ?? "",
  };
}

/**
 * Index a book into Chroma
 *
 * @param data - Book data with metadata and chunks
 * @returns Result of the indexing operation
 */
export async function indexBookToChroma(data: BookIndexData): Promise<BookIndexResult> {
  const { bookId, metadata, chunks, fileType } = data;

  if (chunks.length === 0) {
    return {
      success: false,
      bookId,
      chunksIndexed: 0,
      collectionName: COLLECTION_NAME,
      error: "No chunks to index",
    };
  }

  const collection = await getBooksCollection();
  const totalChunks = chunks.length;

  // Prepare batch data
  const ids = chunks.map(chunk => generateChunkId(bookId, chunk.index));
  const documents = chunks.map(chunk => chunk.text);
  const metadatas = chunks.map(chunk => toChromaMetadata(bookId, metadata, chunk, totalChunks, fileType));

  // Track successfully indexed chunks for accurate reporting on partial failure
  let chunksIndexed = 0;

  // Upsert in batches (Chroma has limits)
  const batchSize = 100;
  for (let i = 0; i < ids.length; i += batchSize) {
    const batchEnd = Math.min(i + batchSize, ids.length);
    try {
      await collection.upsert({
        ids: ids.slice(i, batchEnd),
        documents: documents.slice(i, batchEnd),
        // Cast through unknown since BookChunkMetadata fields are all valid Metadata values
        // (strings, numbers) but lacks index signature that Metadata requires
        metadatas: metadatas.slice(i, batchEnd) as unknown as Metadata[],
      });
      // Only count as indexed after successful upsert
      chunksIndexed = batchEnd;
    } catch (error) {
      // Re-throw infrastructure errors (embedding function failures) - these should not be silently converted to failed results
      if (error instanceof EmbeddingFunctionError) {
        throw error;
      }

      // For data/network errors, return a failed result with accurate chunk count
      // This allows callers to know partial indexing occurred and handle accordingly
      return {
        success: false,
        bookId,
        chunksIndexed,
        collectionName: COLLECTION_NAME,
        error: error instanceof Error ? error.message : "Unknown error during indexing",
      };
    }
  }

  return {
    success: true,
    bookId,
    chunksIndexed: chunks.length,
    collectionName: COLLECTION_NAME,
  };
}

/**
 * Remove all chunks for a book from Chroma
 *
 * @param bookId - The book identifier to remove
 */
export async function removeBookFromChroma(bookId: string): Promise<void> {
  const collection = await getBooksCollection();

  // Find all chunks for this book
  const results = await collection.get({
    where: { bookId },
    limit: 10000, // Get all chunks
  });

  if (results.ids.length > 0) {
    await collection.delete({ ids: results.ids });
  }
}

/**
 * Check if a book exists in Chroma
 *
 * @param bookId - The book identifier to check
 * @returns True if any chunks exist for this book
 */
export async function bookExistsInChroma(bookId: string): Promise<boolean> {
  const collection = await getBooksCollection();
  const results = await collection.get({
    where: { bookId },
    limit: 1,
  });
  return results.ids.length > 0;
}

/**
 * Get the count of chunks for a specific book
 *
 * @param bookId - The book identifier
 * @returns Number of chunks indexed for this book
 */
export async function getBookChunkCount(bookId: string): Promise<number> {
  const collection = await getBooksCollection();
  const results = await collection.get({
    where: { bookId },
    limit: 10000,
  });
  return results.ids.length;
}

/**
 * Get total count of book chunks in Chroma
 *
 * @returns Total number of book chunks in the collection
 */
export async function getBooksChromaCount(): Promise<number> {
  const collection = await getBooksCollection();
  return collection.count();
}

/**
 * Delete the entire books collection from Chroma
 * Use this to start fresh with a clean collection
 *
 * @returns True if deleted, false if collection didn't exist
 */
export async function deleteBooksCollection(): Promise<boolean> {
  const client = getChromaClient();
  try {
    await client.deleteCollection({ name: COLLECTION_NAME });
    console.log(`[Chroma] Deleted collection: ${COLLECTION_NAME}`);
    return true;
  } catch (error) {
    // Collection might not exist - log the actual error for debugging
    console.warn(`[Chroma] Failed to delete collection ${COLLECTION_NAME}:`, error);
    return false;
  }
}

// =============================================================================
// QUERY OPERATIONS
// =============================================================================

/**
 * Search for relevant book chunks
 *
 * @param query - Search query text
 * @param options - Search options
 * @returns Discriminated union: success with results, or failure with error message
 *          Callers must check `success` to distinguish "no matches" from "search failed"
 */
export async function searchBookChunks(
  query: string,
  options: {
    limit?: number;
    bookId?: string;
    fileType?: string;
  } = {},
): Promise<BookSearchResult> {
  const { limit = 10, bookId, fileType } = options;

  try {
    const collection = await getBooksCollection();

    // Build where clause - Chroma Where type supports { [key: string]: value }
    const whereClause: Record<string, string> = {};
    if (bookId) {
      whereClause.bookId = bookId;
    }
    if (fileType) {
      whereClause.fileType = fileType;
    }
    const where: Where | undefined = Object.keys(whereClause).length > 0 ? whereClause : undefined;

    const results = await collection.query({
      queryTexts: [query],
      nResults: limit,
      where,
      include: ["documents", "metadatas", "distances"],
    });

    // Format results
    const formatted: BookSearchHit[] = [];

    if (results.ids[0]) {
      for (let i = 0; i < results.ids[0].length; i++) {
        const id = results.ids[0][i];
        const text = results.documents?.[0]?.[i];
        const metadata = results.metadatas?.[0]?.[i];
        const distance = results.distances?.[0]?.[i];

        if (id && text && metadata) {
          formatted.push({
            id,
            text,
            metadata: metadata as unknown as BookChunkMetadata,
            distance: distance ?? 0,
          });
        }
      }
    }

    return { success: true, results: formatted };
  } catch (error) {
    // Return error result so callers can distinguish "no matches" from "search failed"
    const errorMessage = error instanceof Error ? error.message : "Unknown search error";
    console.error("[Chroma] Search failed:", error);
    return { success: false, error: errorMessage, results: [] };
  }
}
