/**
 * Tests for search helper utilities
 */

import type { MockInstance } from "vitest";
import {
  coalesceSearchRequest,
  dedupeDocuments,
  prepareDocumentsForIndexing,
  transformSearchResultToTerminalResult,
} from "@/lib/utils/search-helpers";
import type { SearchResult } from "@/types/search";

describe("Search Helpers", () => {
  let consoleWarnSpy: MockInstance;
  let consoleLogSpy: MockInstance;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });
  describe("dedupeDocuments", () => {
    it("should remove duplicate documents by id", () => {
      const documents = [
        { id: "1", title: "First" },
        { id: "2", title: "Second" },
        { id: "1", title: "Duplicate" },
        { id: "3", title: "Third" },
        { id: "2", title: "Another Duplicate" },
      ];

      const result = dedupeDocuments(documents);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ id: "1", title: "First" });
      expect(result[1]).toEqual({ id: "2", title: "Second" });
      expect(result[2]).toEqual({ id: "3", title: "Third" });
    });

    it("should handle numeric ids", () => {
      const documents = [
        { id: 1, name: "Item 1" },
        { id: 2, name: "Item 2" },
        { id: 1, name: "Duplicate Item 1" },
      ];

      const result = dedupeDocuments(documents);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: 1, name: "Item 1" });
      expect(result[1]).toEqual({ id: 2, name: "Item 2" });
    });

    it("should use custom id extractor", () => {
      const documents = [
        { slug: "post-1", title: "First Post" },
        { slug: "post-2", title: "Second Post" },
        { slug: "post-1", title: "Duplicate Post" },
        { slug: "post-3", title: "Third Post" },
      ];

      const result = dedupeDocuments(documents, (doc) => doc.slug);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ slug: "post-1", title: "First Post" });
      expect(result[1]).toEqual({ slug: "post-2", title: "Second Post" });
      expect(result[2]).toEqual({ slug: "post-3", title: "Third Post" });
    });

    it("should handle empty arrays", () => {
      const result = dedupeDocuments([]);
      expect(result).toEqual([]);
    });

    it("should handle documents without duplicates", () => {
      const documents = [
        { id: "1", value: "a" },
        { id: "2", value: "b" },
        { id: "3", value: "c" },
      ];

      const result = dedupeDocuments(documents);
      expect(result).toEqual(documents);
    });

    it("should skip documents with missing ids", () => {
      const documents = [
        { id: "1", title: "First" },
        { title: "No ID" } as any,
        { id: "", title: "Empty ID" },
        { id: "2", title: "Second" },
      ];

      const result = dedupeDocuments(documents);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: "1", title: "First" });
      expect(result[1]).toEqual({ id: "2", title: "Second" });
    });

    it("should log warning for duplicates", () => {
      const documents = [
        { id: "1", name: "First" },
        { id: "1", name: "Duplicate" },
        { id: "2", name: "Second" },
        { id: "2", name: "Another Duplicate" },
      ];

      dedupeDocuments(documents);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[Search] 2 duplicate ID(s) detected and skipped:"),
        expect.any(String),
        expect.any(String),
      );
    });
  });

  describe("prepareDocumentsForIndexing", () => {
    it("should deduplicate and log statistics", () => {
      const documents = [
        { id: "1", name: "First" },
        { id: "2", name: "Second" },
        { id: "1", name: "Duplicate" },
      ];

      const result = prepareDocumentsForIndexing(documents, "Test Source");

      expect(result).toHaveLength(2);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "[Search] Test Source: Deduplicated 3 documents to 2 (removed 1 duplicates)",
      );
    });

    it("should not log when no duplicates found", () => {
      const documents = [
        { id: "1", name: "First" },
        { id: "2", name: "Second" },
      ];

      const result = prepareDocumentsForIndexing(documents, "Test Source");

      expect(result).toHaveLength(2);
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it("should use custom id extractor", () => {
      const documents = [
        { code: "ABC", value: 100 },
        { code: "DEF", value: 200 },
        { code: "ABC", value: 300 },
      ];

      const result = prepareDocumentsForIndexing(documents, "Custom ID Test", (doc) => doc.code);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ code: "ABC", value: 100 });
      expect(result[1]).toEqual({ code: "DEF", value: 200 });
    });
  });

  describe("coalesceSearchRequest", () => {
    it("should execute the search function and return results", async () => {
      const mockResults = [{ id: "1", title: "Result" }];
      const searchFn = vi.fn().mockResolvedValue(mockResults);

      const result = await coalesceSearchRequest("test-key", searchFn);

      expect(result).toEqual(mockResults);
      expect(searchFn).toHaveBeenCalledTimes(1);
    });

    it("should return same promise for concurrent requests with same key", async () => {
      let resolveSearch: (value: string[]) => void = () => {
        throw new Error("resolveSearch not set");
      };
      const searchPromise = new Promise<string[]>((resolve) => {
        resolveSearch = resolve;
      });
      const searchFn = vi.fn().mockReturnValue(searchPromise);

      // Start two concurrent requests with the same key
      const promise1 = coalesceSearchRequest("same-key", searchFn);
      const promise2 = coalesceSearchRequest("same-key", searchFn);

      // Resolve the search
      resolveSearch(["result"]);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // Both should get the same result
      expect(result1).toEqual(["result"]);
      expect(result2).toEqual(["result"]);
      // But the search function should only be called once
      expect(searchFn).toHaveBeenCalledTimes(1);
    });

    it("should allow new search after previous completes", async () => {
      const searchFn1 = vi.fn().mockResolvedValue(["first"]);
      const searchFn2 = vi.fn().mockResolvedValue(["second"]);

      // First search
      const result1 = await coalesceSearchRequest("reuse-key", searchFn1);
      expect(result1).toEqual(["first"]);

      // Second search with same key should create new request
      const result2 = await coalesceSearchRequest("reuse-key", searchFn2);
      expect(result2).toEqual(["second"]);

      expect(searchFn1).toHaveBeenCalledTimes(1);
      expect(searchFn2).toHaveBeenCalledTimes(1);
    });

    it("should clean up after promise resolves", async () => {
      const searchFn = vi.fn().mockResolvedValue(["result"]);

      await coalesceSearchRequest("cleanup-key", searchFn);

      // A new request with same key should call the function again (not reuse old promise)
      const searchFn2 = vi.fn().mockResolvedValue(["new-result"]);
      const result = await coalesceSearchRequest("cleanup-key", searchFn2);

      expect(result).toEqual(["new-result"]);
      expect(searchFn2).toHaveBeenCalledTimes(1);
    });

    it("should clean up after promise rejects", async () => {
      const error = new Error("Search failed");
      const searchFn = vi.fn().mockRejectedValue(error);

      await expect(coalesceSearchRequest("error-key", searchFn)).rejects.toThrow("Search failed");

      // A new request with same key should work after error
      const searchFn2 = vi.fn().mockResolvedValue(["recovered"]);
      const result = await coalesceSearchRequest("error-key", searchFn2);

      expect(result).toEqual(["recovered"]);
    });

    it("should handle different keys independently", async () => {
      let resolveA: (value: string) => void = () => {
        throw new Error("resolveA not set");
      };
      let resolveB: (value: string) => void = () => {
        throw new Error("resolveB not set");
      };

      const promiseA = new Promise<string>((resolve) => {
        resolveA = resolve;
      });
      const promiseB = new Promise<string>((resolve) => {
        resolveB = resolve;
      });

      const fnA = vi.fn().mockReturnValue(promiseA);
      const fnB = vi.fn().mockReturnValue(promiseB);

      const resultA = coalesceSearchRequest("key-a", fnA);
      const resultB = coalesceSearchRequest("key-b", fnB);

      // Resolve in different order
      resolveB("B result");
      resolveA("A result");

      expect(await resultA).toBe("A result");
      expect(await resultB).toBe("B result");
      expect(fnA).toHaveBeenCalledTimes(1);
      expect(fnB).toHaveBeenCalledTimes(1);
    });
  });

  describe("transformSearchResultToTerminalResult", () => {
    it("should transform SearchResult to TerminalSearchResult", () => {
      const searchResult: SearchResult = {
        id: "post-123",
        type: "blog",
        title: "Test Post",
        description: "A test description",
        url: "/blog/test-post",
        score: 0.95,
      };

      const result = transformSearchResultToTerminalResult(searchResult);

      expect(result).toEqual({
        id: "blog-post-123",
        label: "Test Post",
        description: "A test description",
        path: "/blog/test-post",
      });
    });

    it("should handle missing optional fields", () => {
      const searchResult: SearchResult = {
        id: "item-1",
        type: "bookmark",
        title: "",
        description: "",
        url: "",
        score: 0.5,
      };

      const result = transformSearchResultToTerminalResult(searchResult);

      expect(result).toEqual({
        id: "bookmark-item-1",
        label: "Untitled",
        description: "",
        path: "#",
      });
    });

    it("should handle missing title with fallback", () => {
      const searchResult = {
        id: "test-id",
        type: "investment",
        title: undefined,
        description: "Some description",
        url: "/investments/test",
        score: 0.8,
      } as unknown as SearchResult;

      const result = transformSearchResultToTerminalResult(searchResult);

      expect(result.label).toBe("Untitled");
    });

    it("should handle missing url with fallback", () => {
      const searchResult = {
        id: "test-id",
        type: "experience",
        title: "Test Title",
        description: "Description",
        url: undefined,
        score: 0.7,
      } as unknown as SearchResult;

      const result = transformSearchResultToTerminalResult(searchResult);

      expect(result.path).toBe("#");
    });

    it("should warn and generate deterministic fallback ID when id is missing", () => {
      const searchResult = {
        id: "",
        type: "blog",
        title: "No ID Post",
        description: "Missing ID",
        url: "/blog/no-id",
        score: 0.6,
      } as SearchResult;

      const result = transformSearchResultToTerminalResult(searchResult);

      // Deterministic fallback: `${type}:${url}:${title}` lowercased, non-alphanum replaced
      expect(result.id).toBe("blog:/blog/no-id:no-id-post");
      expect(result.label).toBe("No ID Post");
    });
  });
});
