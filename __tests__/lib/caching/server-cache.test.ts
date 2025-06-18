/**
 * Tests for Server Cache
 */
import { ServerCache } from "@/lib/server-cache";
import type { UnifiedBookmark } from "@/types/bookmark";
import type { GitHubActivityApiResponse } from "@/types/github";
import type { OgResult } from "@/types";

describe("ServerCache", () => {
  let cache: ServerCache;

  beforeEach(() => {
    cache = new ServerCache();
  });

  afterEach(() => {
    cache.clear();
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
        url: "https://example.com/logo.png",
        source: "google" as const,
        contentType: "image/png",
      };

      // Set fetch result
      cache.setLogoFetch(domain, fetchResult);

      // Should retrieve the result
      const result = cache.getLogoFetch(domain);
      expect(result).toBeDefined();
      expect(result?.url).toBe("https://example.com/logo.png");
      expect(result?.source).toBe("google");
      expect(result?.contentType).toBe("image/png");
      expect(result?.timestamp).toBeDefined();
    });

    it("should handle error results with shorter TTL", () => {
      const domain = "error.com";
      cache.setLogoFetch(domain, { error: "Failed to fetch" });

      const result = cache.getLogoFetch(domain);
      expect(result?.error).toBe("Failed to fetch");
    });

    it("should clear individual logo fetch results", () => {
      cache.setLogoFetch("domain1.com", { url: "url1" });
      cache.setLogoFetch("domain2.com", { url: "url2" });

      cache.clearLogoFetch("domain1.com");

      expect(cache.getLogoFetch("domain1.com")).toBeUndefined();
      expect(cache.getLogoFetch("domain2.com")?.url).toBe("url2");
    });

    it("should clear all logo fetch results", () => {
      cache.setLogoFetch("domain1.com", { url: "url1" });
      cache.setLogoFetch("domain2.com", { url: "url2" });

      cache.clearAllLogoFetches();

      expect(cache.getLogoFetch("domain1.com")).toBeUndefined();
      expect(cache.getLogoFetch("domain2.com")).toBeUndefined();
    });
  });

  describe("Inverted Logo", () => {
    it("should cache and retrieve inverted logos", () => {
      const cacheKey = "inverted-key";
      const buffer = Buffer.from("fake-image-data");
      const analysis = {
        shouldInvert: true,
        brightness: 0.8,
        needsInversion: true,
      };

      cache.setInvertedLogo(cacheKey, buffer, analysis);

      const result = cache.getInvertedLogo(cacheKey);
      expect(result).toBeDefined();
      expect(result?.buffer).toEqual(buffer);
      expect(result?.analysis).toEqual(analysis);
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
      expect(result?.commitCount).toBe(100);
      expect(result?.timestamp).toBeDefined();
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
      expect(result?.title).toBe("Test Page");
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
  });

  describe("Cache Statistics", () => {
    it("should return cache statistics", () => {
      const stats = cache.getStats();
      expect(stats).toBeDefined();
      expect(stats.hits).toBeDefined();
      expect(stats.misses).toBeDefined();
      expect(stats.keys).toBeDefined();
      expect(stats.ksize).toBeDefined();
      expect(stats.vsize).toBeDefined();
    });

    it("should track hits and misses", () => {
      // Get initial stats
      const initialStats = cache.getStats();

      // Cause a miss
      cache.getLogoValidation("non-existent");

      // Add data
      cache.setLogoValidation("exists", true);

      // Cause a hit
      cache.getLogoValidation("exists");

      // Cause another miss
      cache.getLogoValidation("another-non-existent");

      const finalStats = cache.getStats();

      // NodeCache tracks total hits and misses from the beginning
      expect(finalStats.hits).toBeGreaterThan(initialStats.hits);
      expect(finalStats.misses).toBeGreaterThan(initialStats.misses);

      // Should have at least 1 key (the one we set)
      expect(finalStats.keys).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Clear Operations", () => {
    it("should clear all caches with clearAllCaches", () => {
      cache.setLogoValidation("hash", true);
      cache.setBookmarks([]);
      cache.setSearchResults("posts", "query", []);

      cache.clearAllCaches();

      expect(cache.getLogoValidation("hash")).toBeUndefined();
      expect(cache.getBookmarks()).toBeUndefined();
      expect(cache.getSearchResults("posts", "query")).toBeUndefined();
    });

    it("should clear all caches with clear", () => {
      cache.setLogoValidation("hash", true);
      cache.setBookmarks([]);

      cache.clear();

      expect(cache.getLogoValidation("hash")).toBeUndefined();
      expect(cache.getBookmarks()).toBeUndefined();
    });
  });

  describe("Edge Cases", () => {
    it("should handle undefined/null data gracefully", () => {
      // Test with missing trailingYearData
      const incompleteActivity = {
        commitCount: 100,
      } as GitHubActivityApiResponse;

      expect(() => cache.setGithubActivity(incompleteActivity)).not.toThrow();

      const result = cache.getGithubActivity();
      expect(result?.commitCount).toBe(100);
    });

    it("should handle Buffer data correctly", () => {
      const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header
      cache.setLogoFetch("test.com", { buffer });

      const result = cache.getLogoFetch("test.com");
      expect(result?.buffer).toEqual(buffer);
    });
  });
});
