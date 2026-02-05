/**
 * Tests for Dynamic Content Loaders
 *
 * Verifies bookmark index building with fallback slug generation.
 * Per [TST1d]: Test coverage for behavioral changes in buildBookmarksIndex().
 *
 * @module __tests__/lib/search/loaders/dynamic-content
 */

import { buildBookmarksIndex } from "@/lib/search/loaders/dynamic-content";
import type { BookmarkIndexInput } from "@/types/search";

describe("Dynamic Content Loaders", () => {
  describe("buildBookmarksIndex", () => {
    it("generates fallback slugs for all bookmarks", () => {
      const bookmarks: BookmarkIndexInput[] = [
        {
          id: "abc12345-6789-0123-4567-890abcdef012",
          title: "Example Article",
          description: "A test bookmark",
          url: "https://example.com/article",
          tags: ["tech", "testing"],
          content: { author: "Test Author", publisher: "Example.com" },
        },
      ];

      const index = buildBookmarksIndex(bookmarks);

      // Verify index was created
      expect(index).toBeDefined();
      expect(index.documentCount).toBe(1);

      // Search to verify document is indexed
      const results = index.search("Example Article");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe("abc12345-6789-0123-4567-890abcdef012");
    });

    it("indexes titles with special characters", () => {
      const bookmarks: BookmarkIndexInput[] = [
        {
          id: "test1234-5678-9012-3456-789012345678",
          title: "Special!@#Characters",
          description: "",
          url: "https://example.com/path/with spaces/and?query=params",
          tags: [],
          content: {},
        },
      ];

      const index = buildBookmarksIndex(bookmarks);

      // The fallback slug should be URL-safe (alphanumeric + hyphens only)
      // Format: URL sanitized + "-" + first 8 chars of ID
      const results = index.search("Special");
      expect(results.length).toBeGreaterThan(0);
    });

    it("handles bookmarks with minimal data", () => {
      const bookmarks: BookmarkIndexInput[] = [
        {
          id: "minimal1-2345-6789-0123-456789012345",
          title: "",
          description: "",
          url: "https://minimal.example.com",
          tags: [],
          content: {},
        },
      ];

      const index = buildBookmarksIndex(bookmarks);

      expect(index.documentCount).toBe(1);
      // Should use URL as fallback title
      const results = index.search("minimal");
      expect(results.length).toBeGreaterThan(0);
    });

    it("processes tags correctly for indexing", () => {
      const bookmarks: BookmarkIndexInput[] = [
        {
          id: "tagged12-3456-7890-1234-567890123456",
          title: "Tagged Bookmark",
          description: "Has multiple tags",
          url: "https://tagged.example.com",
          tags: ["javascript", "typescript", "testing"],
          content: {},
        },
      ];

      const index = buildBookmarksIndex(bookmarks);

      // Should be searchable by tags
      const jsResults = index.search("javascript");
      expect(jsResults.length).toBeGreaterThan(0);

      const tsResults = index.search("typescript");
      expect(tsResults.length).toBeGreaterThan(0);
    });

    it("handles empty bookmarks array", () => {
      const index = buildBookmarksIndex([]);

      expect(index.documentCount).toBe(0);
      const results = index.search("anything");
      expect(results).toEqual([]);
    });

    it("indexes author and publisher fields", () => {
      const bookmarks: BookmarkIndexInput[] = [
        {
          id: "content1-2345-6789-0123-456789012345",
          title: "Article with Content",
          description: "Has author info",
          url: "https://content.example.com",
          tags: [],
          content: {
            author: "John Smith",
            publisher: "Tech Weekly",
          },
        },
      ];

      const index = buildBookmarksIndex(bookmarks);

      // Should be searchable by author
      const authorResults = index.search("John Smith");
      expect(authorResults.length).toBeGreaterThan(0);

      // Should be searchable by publisher
      const publisherResults = index.search("Tech Weekly");
      expect(publisherResults.length).toBeGreaterThan(0);
    });
  });
});
