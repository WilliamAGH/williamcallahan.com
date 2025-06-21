/**
 * Tests for Server Cache
 */
import { ServerCacheInstance } from "@/lib/server-cache";
import type { ServerCache } from "@/lib/server-cache";
import type { UnifiedBookmark } from "@/types/bookmark";
import type { GitHubActivityApiResponse } from "@/types/github";
import type { OgResult } from "@/types/opengraph";

describe("ServerCache", () => {
  let cache: ServerCache;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    // ServerCache is now a singleton
    cache = ServerCacheInstance;
    cache.flushAll();
    // Suppress console.warn for tests that are expected to trigger it
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    cache.flushAll();
    consoleWarnSpy.mockRestore(); // Restore original console.warn
    jest.restoreAllMocks();
  });

  describe("Logo Validation", () => {
    it("should cache and retrieve logo validation results", () => {
      const imageHash = "test-hash-123";

      // Initially should be undefined
      expect(cache.getLogoValidation(imageHash)).toBeUndefined();

      // Set validation result
      cache.setLogoValidation(imageHash, true);

      // Should retrieve the result
      const result = cache.getLogoValidation(imageHash);
      expect(result).toBeDefined();
      expect(result?.isGlobeIcon).toBe(true);
      expect(result?.timestamp).toBeDefined();
    });

    it("should handle multiple validation entries", () => {
      cache.setLogoValidation("hash1", true);
      cache.setLogoValidation("hash2", false);

      expect(cache.getLogoValidation("hash1")?.isGlobeIcon).toBe(true);
      expect(cache.getLogoValidation("hash2")?.isGlobeIcon).toBe(false);
    });
  });

  describe("Logo Fetch", () => {
    it("should cache and retrieve logo fetch results", () => {
      const domain = "example.com";
      const fetchResult = {
        s3Key: "logos/example.com_google.png",
        cdnUrl: "https://cdn.example.com/logos/example.com_google.png",
        source: "google" as const,
        contentType: "image/png",
        retrieval: "external" as const,
      };

      // Set fetch result
      cache.setLogoFetch(domain, fetchResult);

      // Should retrieve the result
      const result = cache.getLogoFetch(domain);
      expect(result).toBeDefined();
      expect(result?.s3Key).toBe("logos/example.com_google.png");
      expect(result?.cdnUrl).toBe("https://cdn.example.com/logos/example.com_google.png");
      expect(result?.source).toBe("google");
      expect(result?.contentType).toBe("image/png");
      expect(result?.timestamp).toBeDefined();
      expect(result?.buffer).toBeUndefined();
    });

    it("should handle error results with shorter TTL", () => {
      const domain = "error.com";
      cache.setLogoFetch(domain, {
        error: "Failed to fetch",
        s3Key: null,
        cdnUrl: null,
        source: null,
        contentType: "",
        retrieval: "external",
      });

      const result = cache.getLogoFetch(domain);
      expect(result?.error).toBe("Failed to fetch");
    });

    it("should clear individual logo fetch results", () => {
      const result1 = {
        s3Key: "key1",
        cdnUrl: "url1",
        source: "google" as const,
        contentType: "image/png",
        retrieval: "external" as const,
      };
      const result2 = {
        s3Key: "key2",
        cdnUrl: "url2",
        source: "google" as const,
        contentType: "image/png",
        retrieval: "external" as const,
      };
      cache.setLogoFetch("domain1.com", result1);
      cache.setLogoFetch("domain2.com", result2);

      cache.clearLogoFetch("domain1.com");

      expect(cache.getLogoFetch("domain1.com")).toBeUndefined();
      expect(cache.getLogoFetch("domain2.com")?.cdnUrl).toBe("url2");
    });

    it("should clear all logo fetch results", () => {
      const result1 = {
        s3Key: "key1",
        cdnUrl: "url1",
        source: "google" as const,
        contentType: "image/png",
        retrieval: "external" as const,
      };
      const result2 = {
        s3Key: "key2",
        cdnUrl: "url2",
        source: "google" as const,
        contentType: "image/png",
        retrieval: "external" as const,
      };
      cache.setLogoFetch("domain1.com", result1);
      cache.setLogoFetch("domain2.com", result2);

      cache.clearAllLogoFetches();

      expect(cache.getLogoFetch("domain1.com")).toBeUndefined();
      expect(cache.getLogoFetch("domain2.com")).toBeUndefined();
    });
  });

  describe("Inverted Logo", () => {
    it("should cache and retrieve inverted logo metadata", () => {
      const cacheKey = "inverted-key";
      const entry = {
        s3Key: "inverted/inverted-key",
        analysis: {
          hasTransparency: true,
          brightness: 0.8,
          needsLightInversion: false,
          needsDarkInversion: true,
        },
        contentType: "image/png",
      };

      cache.setInvertedLogo(cacheKey, entry);

      const result = cache.getInvertedLogo(cacheKey);
      expect(result).toBeDefined();
      expect(result?.buffer).toBeUndefined();
      expect(result?.s3Key).toBe("inverted/inverted-key");
      expect(result?.analysis).toEqual(entry.analysis);
      expect(result?.contentType).toBe("image/png");
      expect(result?.timestamp).toBeDefined();
    });
  });

  describe("Logo Analysis", () => {
    it("should cache and retrieve logo analysis", () => {
      const cacheKey = "analysis-key";
      const analysis = {
        shouldInvert: false,
        brightness: 0.3,
        needsInversion: false,
      };

      cache.setLogoAnalysis(cacheKey, analysis);

      const result = cache.getLogoAnalysis(cacheKey);
      expect(result).toEqual(analysis);
    });
  });

  describe("Bookmarks", () => {
    const mockBookmarks: UnifiedBookmark[] = [
      {
        id: "1",
        url: "https://example.com",
        title: "Example",
        description: "Test bookmark",
        tags: ["test"],
        imageUrl: null,
        domain: "example.com",
        createdAt: "2024-01-01",
        updatedAt: "2024-01-01",
        isFavorite: false,
      },
    ];

    it("should cache and retrieve bookmarks", () => {
      cache.setBookmarks(mockBookmarks);

      const result = cache.getBookmarks();
      expect(result).toBeDefined();
      expect(result?.bookmarks).toEqual(mockBookmarks);
      expect(result?.lastFetchedAt).toBeDefined();
      expect(result?.lastAttemptedAt).toBeDefined();
    });

    it("should preserve last successful fetch on failure", () => {
      // Set initial bookmarks
      cache.setBookmarks(mockBookmarks);
      const initialResult = cache.getBookmarks();
      const initialFetchTime = initialResult?.lastFetchedAt;

      // Wait a bit
      const futureTime = Date.now() + 1000;
      jest.spyOn(Date, "now").mockReturnValue(futureTime);

      // Set as failure
      cache.setBookmarks([], true);

      const failureResult = cache.getBookmarks();
      expect(failureResult?.bookmarks).toEqual(mockBookmarks); // Preserved original bookmarks
      expect(failureResult?.lastFetchedAt).toBe(initialFetchTime); // Preserved fetch time
      expect(failureResult?.lastAttemptedAt).toBe(futureTime); // Updated attempt time
    });

    it("should correctly determine refresh needs", () => {
      // No cache should need refresh
      expect(cache.shouldRefreshBookmarks()).toBe(true);

      // Fresh cache should not need refresh
      cache.setBookmarks(mockBookmarks);
      expect(cache.shouldRefreshBookmarks()).toBe(false);

      // Empty bookmarks should need refresh
      cache.setBookmarks([]);
      expect(cache.shouldRefreshBookmarks()).toBe(true);
    });

    it("should clear bookmarks cache", () => {
      cache.setBookmarks(mockBookmarks);
      cache.clearBookmarks();
      expect(cache.getBookmarks()).toBeUndefined();
    });
  });

  describe("GitHub Activity", () => {
    const mockActivity: GitHubActivityApiResponse = {
      commitCount: 100,
      pullRequestCount: 20,
      issueCount: 10,
      forkCount: 5,
      contributedProjects: [],
      trailingYearData: {
        dataComplete: true,
        commitHistory: [],
        activeLanguages: [],
        totalCommits: 100,
      },
    };

    it("should cache and retrieve GitHub activity", () => {
      cache.setGithubActivity(mockActivity);

      const result = cache.getGithubActivity();
      expect(result).toBeDefined();
      expect(result?.data.commitCount).toBe(100);
      expect(result?.lastFetchedAt).toBeDefined();
    });

    it("should handle incomplete data as failure", () => {
      const incompleteActivity = {
        ...mockActivity,
        trailingYearData: {
          ...mockActivity.trailingYearData,
          dataComplete: false,
        },
      };

      cache.setGithubActivity(incompleteActivity);
      const result = cache.getGithubActivity();
      expect(result).toBeDefined();
    });

    it("should clear GitHub activity cache", () => {
      cache.setGithubActivity(mockActivity);
      cache.clearGithubActivity();
      expect(cache.getGithubActivity()).toBeUndefined();
    });
  });

  describe("OpenGraph Data", () => {
    const mockOgData: OgResult = {
      title: "Test Page",
      description: "Test description",
      image: "https://example.com/image.png",
      url: "https://example.com",
    };

    it("should cache and retrieve OpenGraph data", () => {
      const url = "https://example.com";
      cache.setOpenGraphData(url, mockOgData);

      const result = cache.getOpenGraphData(url);
      expect(result).toBeDefined();
      expect(result?.data.title).toBe("Test Page");
      expect(result?.lastFetchedAt).toBeDefined();
    });

    it("should handle failure caching", () => {
      const url = "https://fail.com";
      const errorData: OgResult = {
        error: "Failed to fetch",
      };

      cache.setOpenGraphData(url, errorData, true);
      const result = cache.getOpenGraphData(url);
      expect(result?.isFailure).toBe(true);
    });

    it("should determine refresh needs correctly", () => {
      const url = "https://example.com";

      // No cache should need refresh
      expect(cache.shouldRefreshOpenGraph(url)).toBe(true);

      // Fresh cache should not need refresh
      cache.setOpenGraphData(url, mockOgData);
      expect(cache.shouldRefreshOpenGraph(url)).toBe(false);

      // Recent failure should not refresh immediately
      cache.setOpenGraphData(url, { error: "Failed" }, true);
      expect(cache.shouldRefreshOpenGraph(url)).toBe(false);
    });

    it("should clear specific OpenGraph data", () => {
      cache.setOpenGraphData("url1", mockOgData);
      cache.setOpenGraphData("url2", mockOgData);

      cache.clearOpenGraphData("url1");
      expect(cache.getOpenGraphData("url1")).toBeUndefined();
      expect(cache.getOpenGraphData("url2")).toBeDefined();
    });

    it("should clear all OpenGraph data", () => {
      cache.setOpenGraphData("url1", mockOgData);
      cache.setOpenGraphData("url2", mockOgData);

      cache.clearOpenGraphData();
      expect(cache.getOpenGraphData("url1")).toBeUndefined();
      expect(cache.getOpenGraphData("url2")).toBeUndefined();
    });
  });

  describe("Search Results", () => {
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

    it("should clear all search caches", () => {
      cache.setSearchResults("posts", "query", mockResults);
      cache.setSearchResults("investments", "query", mockResults);

      cache.clearSearchCache();

      expect(cache.getSearchResults("posts", "query")).toBeUndefined();
      expect(cache.getSearchResults("investments", "query")).toBeUndefined();
    });
  });

  describe("Cache Statistics", () => {
    it("should return cache statistics", () => {
      const initialStats = cache.getStats();
      const initialKeys = initialStats.keys;

      cache.set("key1", "value1");
      cache.get("key1"); // hit
      cache.get("key2"); // miss

      const stats = cache.getStats();
      expect(stats.keys).toBe(initialKeys + 1); // One new key added
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });

    it("should track hits and misses", () => {
      cache.get("miss1");
      cache.set("hit1", "value");
      cache.get("hit1");
      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });
  });

  describe("Clear Operations", () => {
    it("should clear all caches with clearAllCaches", () => {
      cache.setLogoValidation("hash", true);
      cache.setBookmarks([]);
      cache.clearAllCaches();
      // Logo validation should be preserved (documented behavior)
      expect(cache.getLogoValidation("hash")).toBeDefined();
      expect(cache.getBookmarks()).toBeUndefined();
    });

    it("should clear all caches with flushAll", () => {
      cache.setLogoValidation("hash", true);
      cache.setBookmarks([]);
      cache.flushAll();
      // Logo validation should be preserved (documented behavior)
      expect(cache.getLogoValidation("hash")).toBeDefined();
      expect(cache.getBookmarks()).toBeUndefined();
    });
  });

  describe("Edge Cases", () => {
    it("should handle undefined/null data gracefully", () => {
      cache.set("key_undefined", undefined);
      cache.set("key_null", null);
      expect(cache.get("key_undefined")).toBeUndefined();
      expect(cache.get("key_null")).toBeUndefined(); // Cache doesn't store null values
    });

    it("should not store buffer data in logo fetch cache", () => {
      const domain = "buffer.com";
      const fetchResult = {
        s3Key: "key",
        cdnUrl: "url",
        source: "google" as const,
        contentType: "image/png",
        retrieval: "external" as const,
        buffer: Buffer.from("test"),
      };
      cache.setLogoFetch(domain, fetchResult);
      const result = cache.getLogoFetch(domain);
      expect(result?.buffer).toBeUndefined();
    });
  });
});
