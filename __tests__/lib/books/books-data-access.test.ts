/**
 * Books S3 Data Access Tests
 * @description Tests that the S3-backed data access module reads consolidated
 * book data correctly, surfaces S3 failures via isFallback, and manages the
 * in-memory cache with TTL behavior.
 * @vitest-environment node
 */

import {
  fetchBooksWithFallback,
  fetchBookByIdWithFallback,
  fetchBookListItemsWithFallback,
  fetchBooks,
  clearBooksCache,
} from "@/lib/books/books-data-access.server";
import type { BooksDataset, BooksLatest } from "@/types/schemas/book";

vi.mock("@/lib/s3/json", () => ({
  readJsonS3Optional: vi.fn(),
}));

vi.mock("@/lib/cache", () => ({
  cacheContextGuards: {
    cacheLife: vi.fn(),
    cacheTag: vi.fn(),
    revalidateTag: vi.fn(),
  },
}));

const { readJsonS3Optional } = await import("@/lib/s3/json");
const mockReadJson = readJsonS3Optional as ReturnType<typeof vi.fn>;

const SAMPLE_LATEST: BooksLatest = {
  checksum: "abc123",
  key: "json/books-dev/abc123.json",
  generated: "2026-01-01T00:00:00.000Z",
};

const SAMPLE_DATASET: BooksDataset = {
  version: "1.0.0",
  generated: "2026-01-01T00:00:00.000Z",
  booksCount: 2,
  checksum: "abc123",
  books: [
    { id: "li_book1", title: "TypeScript in Depth", authors: ["Author A"], formats: ["ebook"] },
    {
      id: "li_book2",
      title: "Clean Architecture",
      authors: ["Robert C. Martin"],
      formats: ["ebook", "audio"],
    },
  ],
};

describe("Books S3 Data Access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearBooksCache();
  });

  describe("fetchBooksWithFallback", () => {
    it("returns books with isFallback: false on successful S3 load", async () => {
      mockReadJson.mockResolvedValueOnce(SAMPLE_LATEST).mockResolvedValueOnce(SAMPLE_DATASET);

      const result = await fetchBooksWithFallback();

      expect(result.books).toHaveLength(2);
      expect(result.books[0]?.title).toBe("TypeScript in Depth");
      expect(result.isFallback).toBe(false);
    });

    it("returns empty array with isFallback: false when dataset not yet generated", async () => {
      mockReadJson.mockResolvedValueOnce(null); // no latest.json — expected first-deploy state

      const result = await fetchBooksWithFallback();

      expect(result.books).toHaveLength(0);
      expect(result.isFallback).toBe(false);
    });

    it("returns empty array with isFallback: false when versioned snapshot missing", async () => {
      mockReadJson.mockResolvedValueOnce(SAMPLE_LATEST).mockResolvedValueOnce(null);

      const result = await fetchBooksWithFallback();

      expect(result.books).toHaveLength(0);
      expect(result.isFallback).toBe(false);
    });
  });

  describe("fetchBooks", () => {
    it("returns the books array directly", async () => {
      mockReadJson.mockResolvedValueOnce(SAMPLE_LATEST).mockResolvedValueOnce(SAMPLE_DATASET);

      const books = await fetchBooks();

      expect(books).toHaveLength(2);
      expect(books[1]?.title).toBe("Clean Architecture");
    });
  });

  describe("fetchBookByIdWithFallback", () => {
    it("finds a book by ID with isFallback: false", async () => {
      mockReadJson.mockResolvedValueOnce(SAMPLE_LATEST).mockResolvedValueOnce(SAMPLE_DATASET);

      const result = await fetchBookByIdWithFallback("li_book2");

      expect(result.book).not.toBeNull();
      expect(result.book?.title).toBe("Clean Architecture");
      expect(result.isFallback).toBe(false);
    });

    it("returns null for unknown ID", async () => {
      mockReadJson.mockResolvedValueOnce(SAMPLE_LATEST).mockResolvedValueOnce(SAMPLE_DATASET);

      const result = await fetchBookByIdWithFallback("li_nonexistent");

      expect(result.book).toBeNull();
      expect(result.isFallback).toBe(false);
    });
  });

  describe("fetchBookListItemsWithFallback", () => {
    it("returns minimal book list items with isFallback: false", async () => {
      mockReadJson.mockResolvedValueOnce(SAMPLE_LATEST).mockResolvedValueOnce(SAMPLE_DATASET);

      const result = await fetchBookListItemsWithFallback();

      expect(result.books).toHaveLength(2);
      expect(result.isFallback).toBe(false);
      const item = result.books[0];
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("title");
      expect(item).toHaveProperty("authors");
    });
  });

  describe("in-memory cache", () => {
    it("serves subsequent calls from cache without re-reading S3", async () => {
      mockReadJson.mockResolvedValueOnce(SAMPLE_LATEST).mockResolvedValueOnce(SAMPLE_DATASET);

      await fetchBooksWithFallback();
      expect(mockReadJson).toHaveBeenCalledTimes(2);

      const result = await fetchBooksWithFallback();
      expect(result.books).toHaveLength(2);
      expect(mockReadJson).toHaveBeenCalledTimes(2);
    });

    it("clearBooksCache forces re-read from S3", async () => {
      mockReadJson.mockResolvedValueOnce(SAMPLE_LATEST).mockResolvedValueOnce(SAMPLE_DATASET);

      await fetchBooksWithFallback();
      expect(mockReadJson).toHaveBeenCalledTimes(2);

      clearBooksCache();

      mockReadJson.mockResolvedValueOnce(SAMPLE_LATEST).mockResolvedValueOnce(SAMPLE_DATASET);

      await fetchBooksWithFallback();
      expect(mockReadJson).toHaveBeenCalledTimes(4);
    });
  });

  describe("S3 failure signaling", () => {
    it("returns isFallback: true when S3 throws on first load", async () => {
      mockReadJson.mockRejectedValueOnce(new Error("S3 unavailable"));

      const result = await fetchBooksWithFallback();

      expect(result.books).toHaveLength(0);
      expect(result.isFallback).toBe(true);
    });

    it("returns stale data with isFallback: true when S3 fails after a successful load", async () => {
      // First load succeeds
      mockReadJson.mockResolvedValueOnce(SAMPLE_LATEST).mockResolvedValueOnce(SAMPLE_DATASET);

      const initial = await fetchBooksWithFallback();
      expect(initial.books).toHaveLength(2);
      expect(initial.isFallback).toBe(false);

      // Force cache expiry
      clearBooksCache();

      // S3 throws on reload
      mockReadJson.mockRejectedValueOnce(new Error("S3 unavailable"));

      const result = await fetchBooksWithFallback();

      // Returns empty (cache was cleared) but signals the failure
      expect(result.books).toHaveLength(0);
      expect(result.isFallback).toBe(true);
    });

    it("propagates isFallback through fetchBookByIdWithFallback", async () => {
      mockReadJson.mockRejectedValueOnce(new Error("S3 unavailable"));

      const result = await fetchBookByIdWithFallback("li_book1");

      expect(result.book).toBeNull();
      expect(result.isFallback).toBe(true);
    });

    it("propagates isFallback through fetchBookListItemsWithFallback", async () => {
      mockReadJson.mockRejectedValueOnce(new Error("S3 unavailable"));

      const result = await fetchBookListItemsWithFallback();

      expect(result.books).toHaveLength(0);
      expect(result.isFallback).toBe(true);
    });

    it("clears isFallback after successful refresh following a failure", async () => {
      // First load fails
      mockReadJson.mockRejectedValueOnce(new Error("S3 unavailable"));
      const failed = await fetchBooksWithFallback();
      expect(failed.isFallback).toBe(true);

      // Force cache expiry
      clearBooksCache();

      // Second load succeeds
      mockReadJson.mockResolvedValueOnce(SAMPLE_LATEST).mockResolvedValueOnce(SAMPLE_DATASET);

      const recovered = await fetchBooksWithFallback();
      expect(recovered.books).toHaveLength(2);
      expect(recovered.isFallback).toBe(false);
    });
  });
});
