/**
 * @file Unit tests for Books Chroma sync operations
 * Tests the sync functionality between book uploads and Chroma vector store.
 * @module __tests__/lib/books/chroma-sync.test
 */

import type { TextChunk, EpubMetadata, BookIndexData } from "@/types/books/parsing";

// Check for required Chroma env vars
const REQUIRED_ENV_VARS = ["CHROMA_API_KEY", "CHROMA_TENANT", "CHROMA_DATABASE"] as const;
const missingVars = REQUIRED_ENV_VARS.filter(v => !process.env[v]);
const hasChromaConfig = missingVars.length === 0;

if (!hasChromaConfig) {
  console.warn(`[chroma-sync.test.ts] Skipping tests - missing env vars: ${missingVars.join(", ")}`);
}

// Shared mock collection
let mockCollection: {
  upsert: jest.Mock;
  get: jest.Mock;
  delete: jest.Mock;
  count: jest.Mock;
  query: jest.Mock;
};

function initMockCollection() {
  mockCollection = {
    upsert: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue({ ids: [], embeddings: [], metadatas: [], documents: [] }),
    delete: jest.fn().mockResolvedValue(undefined),
    count: jest.fn().mockResolvedValue(0),
    query: jest.fn().mockResolvedValue({ ids: [[]], documents: [[]], metadatas: [[]], distances: [[]] }),
  };
}

initMockCollection();

// Mock Chroma client
jest.mock("@/lib/chroma/client", () => ({
  getChromaClient: jest.fn().mockImplementation(() => ({
    getOrCreateCollection: jest.fn().mockImplementation(() => Promise.resolve(mockCollection)),
    deleteCollection: jest.fn().mockResolvedValue(undefined),
  })),
}));

const describeIfChroma = hasChromaConfig ? describe : describe.skip;

// Test helpers
const createTestChunk = (overrides: Partial<TextChunk> = {}): TextChunk => ({
  index: 0,
  text: "This is test chunk content.",
  wordCount: 5,
  startOffset: 0,
  endOffset: 27,
  ...overrides,
});

const createTestMetadata = (overrides: Partial<EpubMetadata> = {}): EpubMetadata => ({
  title: "Test Book Title",
  author: "Test Author",
  ...overrides,
});

const createTestIndexData = (overrides: Partial<BookIndexData> = {}): BookIndexData => ({
  bookId: "test-book-id",
  metadata: createTestMetadata(),
  chunks: [createTestChunk()],
  fileType: "book-pdf",
  ...overrides,
});

describeIfChroma("Books Chroma Sync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    initMockCollection();
  });

  describe("parseChromaArray", () => {
    it("should parse comma-separated string into array", async () => {
      const { parseChromaArray } = await import("@/lib/books/chroma-sync");

      expect(parseChromaArray("fiction,science,adventure")).toEqual(["fiction", "science", "adventure"]);
    });

    it("should return empty array for null/undefined", async () => {
      const { parseChromaArray } = await import("@/lib/books/chroma-sync");

      expect(parseChromaArray(null)).toEqual([]);
      expect(parseChromaArray(undefined)).toEqual([]);
      expect(parseChromaArray("")).toEqual([]);
    });

    it("should filter out empty strings", async () => {
      const { parseChromaArray } = await import("@/lib/books/chroma-sync");

      expect(parseChromaArray("fiction,,adventure")).toEqual(["fiction", "adventure"]);
    });
  });

  describe("getBooksCollection", () => {
    it("should return a collection with correct configuration", async () => {
      const { getBooksCollection } = await import("@/lib/books/chroma-sync");
      const collection = await getBooksCollection();

      expect(collection).toBeDefined();
      expect(collection).toHaveProperty("upsert");
      expect(collection).toHaveProperty("get");
      expect(collection).toHaveProperty("delete");
    });
  });

  describe("indexBookToChroma", () => {
    it("should index a book with all fields", async () => {
      const { indexBookToChroma } = await import("@/lib/books/chroma-sync");
      const data = createTestIndexData({
        metadata: createTestMetadata({
          title: "My Book",
          author: "John Doe",
          isbn: "978-1234567890",
          subjects: ["fiction", "adventure"],
          publisher: "Test Publisher",
        }),
        chunks: [
          createTestChunk({ index: 0, text: "Chapter 1 content", chapterId: "ch1", chapterTitle: "Introduction" }),
          createTestChunk({ index: 1, text: "Chapter 2 content", chapterId: "ch2", chapterTitle: "Getting Started" }),
        ],
      });

      const result = await indexBookToChroma(data);

      expect(result.success).toBe(true);
      expect(result.chunksIndexed).toBe(2);
      expect(result.bookId).toBe("test-book-id");
      expect(mockCollection.upsert).toHaveBeenCalled();
    });

    it("should return error for empty chunks", async () => {
      const { indexBookToChroma } = await import("@/lib/books/chroma-sync");
      const data = createTestIndexData({ chunks: [] });

      const result = await indexBookToChroma(data);

      expect(result.success).toBe(false);
      expect(result.error).toBe("No chunks to index");
      expect(result.chunksIndexed).toBe(0);
    });

    it("should batch upserts for large chunk counts", async () => {
      const { indexBookToChroma } = await import("@/lib/books/chroma-sync");

      // Create 250 chunks (should require 3 batches at 100 per batch)
      const chunks = Array.from({ length: 250 }, (_, i) => createTestChunk({ index: i, text: `Chunk ${i} content` }));

      const data = createTestIndexData({ chunks });

      await indexBookToChroma(data);

      // Should have been called 3 times (100 + 100 + 50)
      expect(mockCollection.upsert).toHaveBeenCalledTimes(3);
    });

    it("should handle indexing errors gracefully", async () => {
      const { indexBookToChroma } = await import("@/lib/books/chroma-sync");

      mockCollection.upsert.mockRejectedValueOnce(new Error("Chroma error"));

      const data = createTestIndexData();
      const result = await indexBookToChroma(data);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Chroma error");
    });

    it("should include chapter metadata in chunks", async () => {
      const { indexBookToChroma } = await import("@/lib/books/chroma-sync");
      const data = createTestIndexData({
        chunks: [
          createTestChunk({
            index: 0,
            chapterId: "chapter-1",
            chapterTitle: "The Beginning",
          }),
        ],
      });

      await indexBookToChroma(data);

      expect(mockCollection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          metadatas: [
            expect.objectContaining({
              chapterId: "chapter-1",
              chapterTitle: "The Beginning",
            }),
          ],
        }),
      );
    });

    it("should serialize subjects array as comma-separated string", async () => {
      const { indexBookToChroma } = await import("@/lib/books/chroma-sync");
      const data = createTestIndexData({
        metadata: createTestMetadata({
          subjects: ["fiction", "mystery", "thriller"],
        }),
      });

      await indexBookToChroma(data);

      expect(mockCollection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          metadatas: [expect.objectContaining({ subjects: "fiction,mystery,thriller" })],
        }),
      );
    });
  });

  describe("removeBookFromChroma", () => {
    it("should delete chunks using where clause", async () => {
      const { removeBookFromChroma } = await import("@/lib/books/chroma-sync");

      await removeBookFromChroma("test-book");

      // Now uses direct where-based delete (no get+delete round-trip)
      expect(mockCollection.delete).toHaveBeenCalledWith({
        where: { bookId: "test-book" },
      });
    });

    it("should call delete even for nonexistent book (Chroma handles gracefully)", async () => {
      const { removeBookFromChroma } = await import("@/lib/books/chroma-sync");

      await removeBookFromChroma("nonexistent-book");

      // Direct where-based delete is always called; Chroma handles no-match gracefully
      expect(mockCollection.delete).toHaveBeenCalledWith({
        where: { bookId: "nonexistent-book" },
      });
    });
  });

  describe("bookExistsInChroma", () => {
    it("should return true when book has chunks", async () => {
      const { bookExistsInChroma } = await import("@/lib/books/chroma-sync");

      mockCollection.get.mockResolvedValueOnce({
        ids: ["book_chunk_00000"],
        embeddings: [],
        metadatas: [{}],
        documents: [],
      });

      const exists = await bookExistsInChroma("existing-book");

      expect(exists).toBe(true);
      expect(mockCollection.get).toHaveBeenCalledWith({ where: { bookId: "existing-book" }, limit: 1 });
    });

    it("should return false when book has no chunks", async () => {
      const { bookExistsInChroma } = await import("@/lib/books/chroma-sync");

      const exists = await bookExistsInChroma("nonexistent-book");

      expect(exists).toBe(false);
    });
  });

  describe("getBookChunkCount", () => {
    it("should return count of chunks for a book", async () => {
      const { getBookChunkCount } = await import("@/lib/books/chroma-sync");

      mockCollection.get.mockResolvedValueOnce({
        ids: ["a", "b", "c", "d", "e"],
        embeddings: [],
        metadatas: [],
        documents: [],
      });

      const count = await getBookChunkCount("my-book");

      expect(count).toBe(5);
    });
  });

  describe("getBooksChromaCount", () => {
    it("should return total collection count", async () => {
      const { getBooksChromaCount } = await import("@/lib/books/chroma-sync");

      mockCollection.count.mockResolvedValueOnce(42);

      const count = await getBooksChromaCount();

      expect(count).toBe(42);
    });
  });

  describe("searchBookChunks", () => {
    it("should search and format results", async () => {
      const { searchBookChunks } = await import("@/lib/books/chroma-sync");

      mockCollection.query.mockResolvedValueOnce({
        ids: [["chunk1", "chunk2"]],
        documents: [["First chunk text", "Second chunk text"]],
        metadatas: [
          [
            { bookId: "book1", title: "Book 1", author: "Author 1" },
            { bookId: "book1", title: "Book 1", author: "Author 1" },
          ],
        ],
        distances: [[0.1, 0.2]],
      });

      const result = await searchBookChunks("test query");

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toMatchObject({
        id: "chunk1",
        text: "First chunk text",
        distance: 0.1,
      });
    });

    it("should filter by bookId", async () => {
      const { searchBookChunks } = await import("@/lib/books/chroma-sync");

      await searchBookChunks("query", { bookId: "specific-book" });

      expect(mockCollection.query).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { bookId: "specific-book" },
        }),
      );
    });

    it("should filter by fileType", async () => {
      const { searchBookChunks } = await import("@/lib/books/chroma-sync");

      await searchBookChunks("query", { fileType: "epub" });

      expect(mockCollection.query).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { fileType: "epub" },
        }),
      );
    });

    it("should respect limit option", async () => {
      const { searchBookChunks } = await import("@/lib/books/chroma-sync");

      await searchBookChunks("query", { limit: 5 });

      expect(mockCollection.query).toHaveBeenCalledWith(
        expect.objectContaining({
          nResults: 5,
        }),
      );
    });

    it("should handle empty results as success with empty array", async () => {
      const { searchBookChunks } = await import("@/lib/books/chroma-sync");

      // Default mock returns empty
      const result = await searchBookChunks("query with no results");

      expect(result.success).toBe(true);
      expect(result.results).toEqual([]);
    });

    it("should return error result on query failure", async () => {
      const { searchBookChunks } = await import("@/lib/books/chroma-sync");

      mockCollection.query.mockRejectedValueOnce(new Error("Network timeout"));

      const result = await searchBookChunks("failing query");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Network timeout");
      }
      expect(result.results).toEqual([]);
    });
  });
});
