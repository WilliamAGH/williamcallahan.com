/**
 * Books Search Tests
 *
 * Tests the books search functionality to prevent regressions like:
 * - MiniSearch "duplicate ID" errors from extractField not returning ID
 * - Index building failures
 * - Search result format issues
 */

import type { Book } from "@/types/schemas/book";

// Mock the audiobookshelf server module
jest.mock("@/lib/books/audiobookshelf.server", () => ({
  fetchBooks: jest.fn(),
}));

// Mock ServerCacheInstance
jest.mock("@/lib/server-cache", () => ({
  ServerCacheInstance: {
    get: jest.fn(),
    set: jest.fn(),
    getSearchResults: jest.fn(),
    setSearchResults: jest.fn(),
    shouldRefreshSearch: jest.fn(),
    clearAllCaches: jest.fn(),
  },
}));

// Mock S3 utils to prevent actual S3 calls
jest.mock("@/lib/s3-utils", () => ({
  readJsonS3: jest.fn().mockResolvedValue(null),
  writeJsonS3: jest.fn().mockResolvedValue(undefined),
}));

import { searchBooks } from "@/lib/search";
import { fetchBooks } from "@/lib/books/audiobookshelf.server";
import { ServerCacheInstance } from "@/lib/server-cache";

// Test data: books with valid UUIDs (like real audiobookshelf data)
const mockBooks: Book[] = [
  {
    id: "cd8f9b4a-0555-405b-a95f-8fb8ab3110ea",
    title: "TypeScript Quickly",
    authors: ["Yakov Fain", "Anton Moiseev"],
    coverUrl: "https://example.com/cover1.jpg",
    slug: "typescript-quickly-cd8f9b4a",
  },
  {
    id: "b8896a01-ab31-4880-8cb8-3ab7ddd582ce",
    title: "100 Java Mistakes and How to Avoid Them",
    authors: ["Tagir Valeev"],
    coverUrl: "https://example.com/cover2.jpg",
    slug: "100-java-mistakes-b8896a01",
  },
  {
    id: "740583b6-3206-4054-95a3-488141227469",
    title: "Secrets of the JavaScript Ninja, 2nd Edition",
    authors: ["John Resig", "Bear Bibeault"],
    coverUrl: "https://example.com/cover3.jpg",
    slug: "secrets-of-javascript-ninja-740583b6",
  },
  {
    id: "91e3475d-1bb2-40ab-b820-951a84e2fa2b",
    title: "The Joy of JavaScript",
    authors: ["Luis Atencio"],
    coverUrl: "https://example.com/cover4.jpg",
    slug: "joy-of-javascript-91e3475d",
  },
  {
    id: "73da20e3-9fa1-421b-9e5e-b0ea885f29b7",
    title: "React Quickly, Second Edition",
    authors: ["Morten Barklund", "Azat Mardan"],
    coverUrl: "https://example.com/cover5.jpg",
    slug: "react-quickly-73da20e3",
  },
];

describe("Books Search", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no cache hit, force fresh index build
    (ServerCacheInstance.get as jest.Mock).mockReturnValue(undefined);
    (ServerCacheInstance.getSearchResults as jest.Mock).mockReturnValue(undefined);
    (ServerCacheInstance.shouldRefreshSearch as jest.Mock).mockReturnValue(true);
    // Return mock books
    (fetchBooks as jest.Mock).mockResolvedValue(mockBooks);
  });

  describe("Index Building", () => {
    it("should build index without duplicate ID errors", async () => {
      // This test catches the regression where extractField returned "" for "id" field,
      // causing MiniSearch to throw "duplicate ID" error for all documents
      const results = await searchBooks("typescript");

      // Should not throw, should return results
      expect(Array.isArray(results)).toBe(true);
    });

    it("should handle books with UUID-style IDs", async () => {
      // Real audiobookshelf data uses UUIDs - search for a common term
      const results = await searchBooks("edition");

      // Should return results - multiple books have "edition" in title
      expect(results.length).toBeGreaterThan(0);
      // Verify IDs are UUIDs (36 chars with dashes)
      for (const result of results) {
        expect(result.id.length).toBe(36);
        expect(result.id).toMatch(/^[a-f0-9-]+$/);
      }
    });

    it("should correctly extract and use book IDs", async () => {
      // Search for something that will match
      const results = await searchBooks("typescript");

      // Each result should have a valid ID matching our mock data
      expect(results.length).toBeGreaterThan(0);
      for (const result of results) {
        expect(result.id).toBeTruthy();
        expect(typeof result.id).toBe("string");
        // IDs should be UUIDs, not empty strings
        expect(result.id.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Search Functionality", () => {
    it("should find books by title", async () => {
      const results = await searchBooks("TypeScript");

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some(r => r.title.toLowerCase().includes("typescript"))).toBe(true);
    });

    it("should find books by author", async () => {
      const results = await searchBooks("Resig");

      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it("should return results for Java-related searches", async () => {
      // This was the specific failing case - search for "java" should return book results
      const results = await searchBooks("java");

      expect(results.length).toBeGreaterThanOrEqual(1);
      // Should find the Java book
      expect(results.some(r => r.title.toLowerCase().includes("java"))).toBe(true);
    });

    it("should return results for JavaScript searches", async () => {
      const results = await searchBooks("javascript");

      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Result Format", () => {
    it("should return SearchResult objects with correct shape", async () => {
      // Use a query that matches books
      const results = await searchBooks("typescript");

      expect(results.length).toBeGreaterThan(0);
      for (const result of results) {
        expect(result).toHaveProperty("id");
        expect(result).toHaveProperty("type");
        expect(result).toHaveProperty("title");
        expect(result).toHaveProperty("url");
        expect(result).toHaveProperty("score");
      }
    });

    it("should have type 'page' for book results", async () => {
      const results = await searchBooks("javascript");

      expect(results.length).toBeGreaterThan(0);
      for (const result of results) {
        expect(result.type).toBe("page");
      }
    });

    it("should have URL pointing to /books/ path", async () => {
      const results = await searchBooks("react");

      expect(results.length).toBeGreaterThan(0);
      for (const result of results) {
        expect(result.url).toMatch(/^\/books\//);
      }
    });

    it("should return raw book titles (prefix added by API aggregation)", async () => {
      const results = await searchBooks("java");

      expect(results.length).toBeGreaterThan(0);
      for (const result of results) {
        // searchBooks returns raw titles - "[Books]" prefix is added by /api/search/all
        expect(typeof result.title).toBe("string");
        expect(result.title.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty books array gracefully", async () => {
      (fetchBooks as jest.Mock).mockResolvedValue([]);

      const results = await searchBooks("anything");

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });

    it("should handle books with missing optional fields", async () => {
      const booksWithMissingFields: Book[] = [
        {
          id: "test-id-1",
          title: "Book Without Cover",
          authors: [],
          slug: "book-without-cover",
          // coverUrl is optional
        },
      ];
      (fetchBooks as jest.Mock).mockResolvedValue(booksWithMissingFields);

      // Search for the book title
      const results = await searchBooks("Book Without Cover");

      expect(results.length).toBe(1);
    });

    it("should not throw on concurrent searches", async () => {
      // Simulate multiple concurrent searches
      const searches = Promise.all([searchBooks("typescript"), searchBooks("java"), searchBooks("react")]);

      await expect(searches).resolves.toBeDefined();
    });
  });
});
