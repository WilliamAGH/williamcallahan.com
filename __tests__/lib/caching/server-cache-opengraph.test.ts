/**
 * @file Unit tests for ServerCache OpenGraph and GitHub activity caching
 * Tests OpenGraph metadata caching and GitHub activity data caching.
 * @module __tests__/lib/caching/server-cache-opengraph.test
 */
import { ServerCacheInstance, type ServerCache } from "@/lib/server-cache";
import type { GitHubActivityApiResponse } from "@/types/github";
import type { OgResult } from "@/types/opengraph";
import type { MockInstance } from "vitest";

describe("ServerCache - OpenGraph & GitHub", () => {
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

  describe("OpenGraph Cache", () => {
    it("should preserve OpenGraph metadata fields when caching", () => {
      const url = "https://example.com";
      const data: OgResult = {
        url,
        timestamp: Date.now(),
        source: "external",
        imageUrl: "https://example.com/og.png",
        title: "Example Title",
        description: "Example Description",
        siteName: "Example Site",
        profileImageUrl: "https://example.com/profile.png",
        ogMetadata: {
          "og:type": "website",
          "og:image": null,
        },
        socialProfiles: {
          GitHub: "https://github.com/example",
        },
      };

      cache.setOpenGraphData(url, data);
      const cached = cache.getOpenGraphData(url);

      expect(cached?.data).toEqual(
        expect.objectContaining({
          url,
          title: "Example Title",
          description: "Example Description",
          siteName: "Example Site",
          profileImageUrl: "https://example.com/profile.png",
          ogMetadata: {
            "og:type": "website",
            "og:image": null,
          },
          socialProfiles: {
            GitHub: "https://github.com/example",
          },
        }),
      );
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
      imageUrl: "https://example.com/image.png",
      siteName: "Example Site",
      url: "https://example.com",
      timestamp: Date.now(),
      source: "external",
    };

    it("should cache and retrieve OpenGraph data", () => {
      const url = "https://example.com";
      cache.setOpenGraphData(url, mockOgData);

      const result = cache.getOpenGraphData(url);
      expect(result).toBeDefined();
      expect(result?.data.title).toBe("Test Page");
      expect(result?.data.siteName).toBe("Example Site");
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
});
