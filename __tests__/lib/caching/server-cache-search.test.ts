/**
 * @file Unit tests for ServerCache search results caching
 * Tests search results caching by data type and query normalization.
 * @module __tests__/lib/caching/server-cache-search.test
 */
import { ServerCacheInstance, type ServerCache } from "@/lib/server-cache";
import { vi, type MockInstance } from "vitest";

describe("ServerCache - Search Results", () => {
  let cache: ServerCache;
  let consoleWarnSpy: MockInstance;

  beforeEach(() => {
    cache = ServerCacheInstance;
    cache.flushAll();
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    cache.flushAll();
    consoleWarnSpy.mockRestore();
    vi.restoreAllMocks();
  });

  const mockResults = [
    { id: "1", title: "Result 1" },
    { id: "2", title: "Result 2" },
  ];

  it("should cache and retrieve search results", () => {
    cache.setSearchResults("posts", "test query", mockResults);

    const result = cache.getSearchResults("posts", "test query");
    expect(result).toBeDefined();
    expect(result?.results).toEqual(mockResults);
    expect(result?.query).toBe("test query");
    expect(result?.dataType).toBe("posts");
  });

  it("should normalize query case", () => {
    cache.setSearchResults("posts", "Test Query", mockResults);

    // Should find with different case
    const result = cache.getSearchResults("posts", "TEST QUERY");
    expect(result?.results).toEqual(mockResults);
  });

  it("should track different data types separately", () => {
    const postsResults = [{ id: "p1" }];
    const bookmarksResults = [{ id: "b1" }];

    cache.setSearchResults("posts", "query", postsResults);
    cache.setSearchResults("bookmarks", "query", bookmarksResults);

    expect(cache.getSearchResults("posts", "query")?.results).toEqual(postsResults);
    expect(cache.getSearchResults("bookmarks", "query")?.results).toEqual(bookmarksResults);
  });

  it("should determine refresh needs", () => {
    // No cache should need refresh
    expect(cache.shouldRefreshSearch("posts", "query")).toBe(true);

    // Fresh cache should not need refresh
    cache.setSearchResults("posts", "query", mockResults);
    expect(cache.shouldRefreshSearch("posts", "query")).toBe(false);
  });

  it("should clear search cache by data type", () => {
    cache.setSearchResults("posts", "query1", mockResults);
    cache.setSearchResults("posts", "query2", mockResults);
    cache.setSearchResults("bookmarks", "query1", mockResults);

    cache.clearSearchCache("posts");

    expect(cache.getSearchResults("posts", "query1")).toBeUndefined();
    expect(cache.getSearchResults("posts", "query2")).toBeUndefined();
    expect(cache.getSearchResults("bookmarks", "query1")).toBeDefined();
  });

  it("should clear all search caches", () => {
    cache.setSearchResults("posts", "query", mockResults);
    cache.setSearchResults("bookmarks", "query", mockResults);

    cache.clearSearchCache();

    expect(cache.getSearchResults("posts", "query")).toBeUndefined();
    expect(cache.getSearchResults("bookmarks", "query")).toBeUndefined();
  });

  it("should clear all search caches including investments", () => {
    cache.setSearchResults("posts", "query", mockResults);
    cache.setSearchResults("investments", "query", mockResults);

    cache.clearSearchCache();

    expect(cache.getSearchResults("posts", "query")).toBeUndefined();
    expect(cache.getSearchResults("investments", "query")).toBeUndefined();
  });
});
