/**
 * Books Database Data Access Tests
 * @description Tests that the DB-backed data access module reads consolidated
 * book data correctly, surfaces database failures via isFallback, and emits
 * cache-tag invalidation requests when refreshes are forced.
 * @vitest-environment node
 */

import {
  fetchBooksWithFallback,
  fetchBookByIdWithFallback,
  fetchBookListItemsWithFallback,
  fetchBooks,
  clearBooksCache,
} from "@/lib/books/books-data-access.server";
import type { Book } from "@/types/schemas/book";

vi.mock("@/lib/db/queries/books", () => ({
  readBooksFromDb: vi.fn(),
}));

vi.mock("@/lib/cache", () => ({
  cacheContextGuards: {
    cacheLife: vi.fn(),
    cacheTag: vi.fn(),
    revalidateTag: vi.fn(),
  },
  USE_NEXTJS_CACHE: true,
  withCacheFallback: async (
    cachedFn: () => Promise<unknown>,
    fallbackFn: () => Promise<unknown>,
  ) => {
    try {
      return await cachedFn();
    } catch {
      return await fallbackFn();
    }
  },
}));

const { readBooksFromDb } = await import("@/lib/db/queries/books");
const mockReadBooksFromDb = readBooksFromDb as ReturnType<typeof vi.fn>;
const { cacheContextGuards } = await import("@/lib/cache");
const mockCacheLife = cacheContextGuards.cacheLife as ReturnType<typeof vi.fn>;
const mockRevalidateTag = cacheContextGuards.revalidateTag as ReturnType<typeof vi.fn>;

const SAMPLE_BOOKS: Book[] = [
  { id: "li_book1", title: "TypeScript in Depth", authors: ["Author A"], formats: ["ebook"] },
  {
    id: "li_book2",
    title: "Clean Architecture",
    authors: ["Robert C. Martin"],
    formats: ["ebook", "audio"],
  },
];

describe("Books Database Data Access", () => {
  beforeEach(() => {
    mockReadBooksFromDb.mockReset();
    mockCacheLife.mockReset();
    mockRevalidateTag.mockReset();
    clearBooksCache();
  });

  describe("fetchBooksWithFallback", () => {
    it("returns books with isFallback: false on successful DB load", async () => {
      mockReadBooksFromDb.mockResolvedValueOnce(SAMPLE_BOOKS);

      const result = await fetchBooksWithFallback();

      expect(result.books).toHaveLength(2);
      expect(result.books[0]?.title).toBe("TypeScript in Depth");
      expect(result.isFallback).toBe(false);
    });

    it("returns empty array with isFallback: false when dataset not yet generated", async () => {
      mockReadBooksFromDb.mockResolvedValueOnce([]);

      const result = await fetchBooksWithFallback();

      expect(result.books).toHaveLength(0);
      expect(result.isFallback).toBe(false);
    });
  });

  describe("fetchBooks", () => {
    it("returns the books array directly", async () => {
      mockReadBooksFromDb.mockResolvedValueOnce(SAMPLE_BOOKS);

      const books = await fetchBooks();

      expect(books).toHaveLength(2);
      expect(books[1]?.title).toBe("Clean Architecture");
    });
  });

  describe("fetchBookByIdWithFallback", () => {
    it("finds a book by ID with isFallback: false", async () => {
      mockReadBooksFromDb.mockResolvedValueOnce(SAMPLE_BOOKS);

      const result = await fetchBookByIdWithFallback("li_book2");

      expect(result.book).not.toBeNull();
      expect(result.book?.title).toBe("Clean Architecture");
      expect(result.isFallback).toBe(false);
    });

    it("returns null for unknown ID", async () => {
      mockReadBooksFromDb.mockResolvedValueOnce(SAMPLE_BOOKS);

      const result = await fetchBookByIdWithFallback("li_nonexistent");

      expect(result.book).toBeNull();
      expect(result.isFallback).toBe(false);
    });
  });

  describe("fetchBookListItemsWithFallback", () => {
    it("returns minimal book list items with isFallback: false", async () => {
      mockReadBooksFromDb.mockResolvedValueOnce(SAMPLE_BOOKS);

      const result = await fetchBookListItemsWithFallback();

      expect(result.books).toHaveLength(2);
      expect(result.isFallback).toBe(false);
      const item = result.books[0];
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("title");
      expect(item).toHaveProperty("authors");
    });
  });

  describe("cache behavior", () => {
    it("reads from DB for repeated uncached invocations", async () => {
      mockReadBooksFromDb.mockResolvedValueOnce(SAMPLE_BOOKS);
      mockReadBooksFromDb.mockResolvedValueOnce(SAMPLE_BOOKS);

      await fetchBooksWithFallback();
      expect(mockReadBooksFromDb).toHaveBeenCalledTimes(1);

      const result = await fetchBooksWithFallback();
      expect(result.books).toHaveLength(2);
      expect(mockReadBooksFromDb).toHaveBeenCalledTimes(2);
    });

    it("clearBooksCache emits cache-tag invalidation for books dataset", () => {
      clearBooksCache();
      expect(mockRevalidateTag).toHaveBeenCalledWith("Books", "books-dataset");
    });
  });

  describe("Next.js cache revalidate policy", () => {
    it("uses 1-hour revalidate when returning healthy data", async () => {
      mockReadBooksFromDb.mockResolvedValueOnce(SAMPLE_BOOKS);

      const result = await fetchBooksWithFallback();

      expect(result.isFallback).toBe(false);
      expect(mockCacheLife).toHaveBeenLastCalledWith("Books", { revalidate: 3600 });
    });

    it("uses 5-minute revalidate when returning fallback data", async () => {
      mockReadBooksFromDb.mockRejectedValueOnce(new Error("DB unavailable"));

      const result = await fetchBooksWithFallback();

      expect(result.isFallback).toBe(true);
      expect(mockCacheLife).toHaveBeenLastCalledWith("Books", { revalidate: 300 });
    });
  });

  describe("database failure signaling", () => {
    it("returns isFallback: true when DB throws on first load", async () => {
      mockReadBooksFromDb.mockRejectedValueOnce(new Error("DB unavailable"));

      const result = await fetchBooksWithFallback();

      expect(result.books).toHaveLength(0);
      expect(result.isFallback).toBe(true);
    });

    it("returns empty with isFallback: true when DB fails after a successful load", async () => {
      mockReadBooksFromDb.mockResolvedValueOnce(SAMPLE_BOOKS);

      const initial = await fetchBooksWithFallback();
      expect(initial.books).toHaveLength(2);
      expect(initial.isFallback).toBe(false);

      clearBooksCache();

      mockReadBooksFromDb.mockRejectedValueOnce(new Error("DB unavailable"));

      const result = await fetchBooksWithFallback();

      expect(result.books).toHaveLength(0);
      expect(result.isFallback).toBe(true);
    });

    it("propagates isFallback through fetchBookByIdWithFallback", async () => {
      mockReadBooksFromDb.mockRejectedValueOnce(new Error("DB unavailable"));

      const result = await fetchBookByIdWithFallback("li_book1");

      expect(result.book).toBeNull();
      expect(result.isFallback).toBe(true);
    });

    it("propagates isFallback through fetchBookListItemsWithFallback", async () => {
      mockReadBooksFromDb.mockRejectedValueOnce(new Error("DB unavailable"));

      const result = await fetchBookListItemsWithFallback();

      expect(result.books).toHaveLength(0);
      expect(result.isFallback).toBe(true);
    });

    it("clears isFallback after successful refresh following a failure", async () => {
      mockReadBooksFromDb.mockRejectedValueOnce(new Error("DB unavailable"));
      const failed = await fetchBooksWithFallback();
      expect(failed.isFallback).toBe(true);

      clearBooksCache();

      mockReadBooksFromDb.mockResolvedValueOnce(SAMPLE_BOOKS);

      const recovered = await fetchBooksWithFallback();
      expect(recovered.books).toHaveLength(2);
      expect(recovered.isFallback).toBe(false);
    });
  });
});
