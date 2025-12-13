/**
 * Book Transform Functions - Regression Tests
 * Tests that AudioBookShelf API data transforms correctly to Book types.
 */

import {
  absItemToBook,
  absItemToBookListItem,
  absItemsToBooks,
  absItemsToBookListItems,
  buildDirectCoverUrl,
} from "@/lib/books/transforms";
import type { AbsLibraryItem } from "@/types/schemas/book";

const BASE_OPTIONS = { baseUrl: "https://abs.example.com", apiKey: "test-key" };

// Minimal valid ABS item
function makeAbsItem(overrides: Partial<AbsLibraryItem> = {}): AbsLibraryItem {
  return {
    id: "test-id",
    mediaType: "book",
    media: {
      metadata: {
        title: "Test Book",
      },
      ...overrides.media,
    },
    ...overrides,
  };
}

describe("Book Transforms", () => {
  describe("Author extraction", () => {
    it("extracts authors from structured array", () => {
      const item = makeAbsItem({
        media: {
          metadata: {
            title: "Test",
            authors: [{ name: "Alice" }, { name: "Bob" }],
          },
        },
      });
      const book = absItemToBook(item, BASE_OPTIONS);
      expect(book.authors).toEqual(["Alice", "Bob"]);
    });

    it("falls back to authorName string when authors array empty", () => {
      const item = makeAbsItem({
        media: {
          metadata: {
            title: "Test",
            authors: [],
            authorName: "Fu Cheng",
          },
        },
      });
      const book = absItemToBook(item, BASE_OPTIONS);
      expect(book.authors).toEqual(["Fu Cheng"]);
    });

    it("splits comma-separated authorName into array", () => {
      const item = makeAbsItem({
        media: {
          metadata: {
            title: "Test",
            authorName: "David Thomas, Andrew Hunt",
          },
        },
      });
      const book = absItemToBook(item, BASE_OPTIONS);
      expect(book.authors).toEqual(["David Thomas", "Andrew Hunt"]);
    });

    it("returns undefined when no author data", () => {
      const item = makeAbsItem();
      const book = absItemToBook(item, BASE_OPTIONS);
      expect(book.authors).toBeUndefined();
    });
  });

  describe("Format detection", () => {
    it("sets ebook format when ebookFormat present", () => {
      const item = makeAbsItem({
        media: {
          metadata: { title: "Test" },
          ebookFormat: "epub",
        },
      });
      const book = absItemToBook(item, BASE_OPTIONS);
      expect(book.formats).toEqual(["ebook"]);
    });

    it("sets both ebook and audio formats when duration > 0", () => {
      // AudioBookShelf audiobooks are treated as having both formats
      const item = makeAbsItem({
        media: {
          metadata: { title: "Test" },
          duration: 3600,
        },
      });
      const book = absItemToBook(item, BASE_OPTIONS);
      expect(book.formats).toEqual(["ebook", "audio"]);
    });

    it("sets both formats when ebook and audio present", () => {
      const item = makeAbsItem({
        media: {
          metadata: { title: "Test" },
          ebookFormat: "epub",
          duration: 7200,
        },
      });
      const book = absItemToBook(item, BASE_OPTIONS);
      expect(book.formats).toContain("ebook");
      expect(book.formats).toContain("audio");
    });

    it("defaults to ebook when no format indicators", () => {
      const item = makeAbsItem();
      const book = absItemToBook(item, BASE_OPTIONS);
      expect(book.formats).toEqual(["ebook"]);
    });
  });

  describe("Cover URL generation", () => {
    it("builds proxied cover URL through local API", () => {
      const item = makeAbsItem({ id: "book-123" });
      const book = absItemToBook(item, BASE_OPTIONS);
      // Cover URLs route through our local /api/cache/images proxy
      // to avoid Next.js Image Optimization remote pattern issues
      const expectedDirectUrl = "https://abs.example.com/api/items/book-123/cover?token=test-key";
      expect(book.coverUrl).toBe(`/api/cache/images?url=${encodeURIComponent(expectedDirectUrl)}`);
    });

    it("buildDirectCoverUrl returns direct AudioBookShelf URL", () => {
      // Direct URL is used for server-side operations like blur generation
      const directUrl = buildDirectCoverUrl("book-456", "https://abs.example.com", "test-key");
      expect(directUrl).toBe("https://abs.example.com/api/items/book-456/cover?token=test-key");
    });
  });

  describe("ISBN parsing", () => {
    it("extracts ISBN-10", () => {
      const item = makeAbsItem({
        media: { metadata: { title: "Test", isbn: "0135957052" } },
      });
      const book = absItemToBook(item, BASE_OPTIONS);
      expect(book.isbn10).toBe("0135957052");
      expect(book.isbn13).toBeUndefined();
    });

    it("extracts ISBN-13", () => {
      const item = makeAbsItem({
        media: { metadata: { title: "Test", isbn: "9780135957059" } },
      });
      const book = absItemToBook(item, BASE_OPTIONS);
      expect(book.isbn13).toBe("9780135957059");
      expect(book.isbn10).toBeUndefined();
    });

    it("strips hyphens from ISBN", () => {
      const item = makeAbsItem({
        media: { metadata: { title: "Test", isbn: "978-0-13-595705-9" } },
      });
      const book = absItemToBook(item, BASE_OPTIONS);
      expect(book.isbn13).toBe("9780135957059");
    });
  });

  describe("Audio metadata", () => {
    it("includes audio fields when format is audio", () => {
      const item = makeAbsItem({
        media: {
          metadata: {
            title: "Test",
            narrators: [{ name: "Anna Katarina" }],
          },
          duration: 28800,
          chapters: [{ id: 1 }, { id: 2 }, { id: 3 }],
        },
      });
      const book = absItemToBook(item, BASE_OPTIONS);
      expect(book.audioNarrators).toEqual(["Anna Katarina"]);
      expect(book.audioDurationSeconds).toBe(28800);
      expect(book.audioChapterCount).toBe(3);
    });

    it("excludes audio fields when format is ebook only", () => {
      const item = makeAbsItem({
        media: {
          metadata: { title: "Test" },
          ebookFormat: "epub",
        },
      });
      const book = absItemToBook(item, BASE_OPTIONS);
      expect(book.audioNarrators).toBeUndefined();
      expect(book.audioDurationSeconds).toBeUndefined();
      expect(book.audioChapterCount).toBeUndefined();
    });
  });

  describe("BookListItem transform", () => {
    it("returns minimal fields for grid display", () => {
      const item = makeAbsItem({
        id: "list-item-id",
        media: {
          metadata: {
            title: "Grid Book",
            authorName: "Jane Doe",
          },
          ebookFormat: "pdf",
          duration: 1000,
        },
      });
      const listItem = absItemToBookListItem(item, BASE_OPTIONS);

      // Cover URL should be proxied through local API
      const expectedDirectUrl = "https://abs.example.com/api/items/list-item-id/cover?token=test-key";
      expect(listItem).toEqual({
        id: "list-item-id",
        title: "Grid Book",
        authors: ["Jane Doe"],
        coverUrl: `/api/cache/images?url=${encodeURIComponent(expectedDirectUrl)}`,
      });
    });
  });

  describe("Batch transforms", () => {
    it("transforms array of items to books", () => {
      const items = [
        makeAbsItem({ id: "1", media: { metadata: { title: "Book 1" } } }),
        makeAbsItem({ id: "2", media: { metadata: { title: "Book 2" } } }),
      ];
      const books = absItemsToBooks(items, BASE_OPTIONS);
      expect(books).toHaveLength(2);
      expect(books[0].title).toBe("Book 1");
      expect(books[1].title).toBe("Book 2");
    });

    it("transforms array of items to list items", () => {
      const items = [
        makeAbsItem({ id: "1", media: { metadata: { title: "Book 1" } } }),
        makeAbsItem({ id: "2", media: { metadata: { title: "Book 2" } } }),
      ];
      const listItems = absItemsToBookListItems(items, BASE_OPTIONS);
      expect(listItems).toHaveLength(2);
      expect(listItems[0].title).toBe("Book 1");
      expect(listItems[1].title).toBe("Book 2");
    });
  });
});
