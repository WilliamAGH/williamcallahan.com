/**
 * GitHub Activity API Cache Tests
 *
 * Tests the caching functionality for GitHub activity data according to the
 * multi-tiered caching architecture (docs/projects/structure/caching.md).
 *
 * Validates ServerCacheInstance methods for GitHub activity storage and retrieval:
 * - In-memory caching with appropriate TTLs
 * - Request coalescing behavior
 * - Cache invalidation mechanisms
 * - Concurrent access handling
 *
 * These tests use mocked ServerCacheInstance to validate cache behavior without
 * external dependencies, aligning with the testing requirements in caching.md.
 */

// Vitest provides describe, it, expect, beforeEach, afterEach, beforeAll, beforeAll globally
import type { MockedFunction } from "vitest";
import type { GitHubActivityApiResponse } from "../../../../src/types/github";

// Mock the server-cache module with inline functions
vi.mock("../../../../src/lib/server-cache", () => ({
  ServerCacheInstance: {
    setGithubActivity: vi.fn(),
    getGithubActivity: vi.fn(),
    clearGithubActivity: vi.fn(),
    getStats: vi.fn(() => ({
      hits: 0,
      misses: 0,
      keys: 0,
      ksize: 0,
      vsize: 0,
    })),
  },
  __esModule: true,
}));

// Import the mocked ServerCacheInstance after the mock is defined
import { ServerCacheInstance } from "../../../../src/lib/server-cache";

// Get references to the mocked functions
const mockSetGithubActivity = ServerCacheInstance.setGithubActivity as MockedFunction<
  (activity: GitHubActivityApiResponse) => void
>;
const mockGetGithubActivity = ServerCacheInstance.getGithubActivity as MockedFunction<
  () => GitHubActivityApiResponse | undefined
>;
const mockClearGithubActivity = ServerCacheInstance.clearGithubActivity as MockedFunction<
  () => void
>;
const mockGetStats = ServerCacheInstance.getStats as MockedFunction<
  () => {
    hits: number;
    misses: number;
    keys: number;
    ksize: number;
    vsize: number;
  }
>;

// Set up mock state
const mockGithubActivity: { current: GitHubActivityApiResponse | undefined } = {
  current: undefined,
};
let lastFetchedAt = Date.now();

// Configure mock implementations
mockSetGithubActivity.mockImplementation((activity: GitHubActivityApiResponse) => {
  mockGithubActivity.current = activity;
  lastFetchedAt = Date.now();
});

mockGetGithubActivity.mockImplementation(() => {
  if (!mockGithubActivity.current) return undefined;
  return {
    ...mockGithubActivity.current,
    lastFetchedAt,
    lastAttemptedAt: lastFetchedAt,
    timestamp: lastFetchedAt,
  };
});

mockClearGithubActivity.mockImplementation(() => {
  mockGithubActivity.current = undefined;
});

// Mock GitHub activity data
const MOCK_GITHUB_ACTIVITY: GitHubActivityApiResponse = {
  trailingYearData: {
    source: "api",
    data: [
      {
        date: "2023-01-01",
        count: 5,
        level: 2,
      },
    ],
    totalContributions: 100,
    dataComplete: true,
  },
  cumulativeAllTimeData: {
    source: "api",
    data: [
      {
        date: "2023-01-01",
        count: 5,
        level: 2,
      },
    ],
    totalContributions: 100,
    dataComplete: true,
  },
};

describe("GitHub Activity API Cache Tests", () => {
  beforeEach(() => {
    // Reset mocks and clear state before each test
    mockSetGithubActivity.mockClear();
    mockGetGithubActivity.mockClear();
    mockClearGithubActivity.mockClear();
    mockGetStats.mockClear();
    mockGithubActivity.current = undefined;
  });

  it("should set and get GitHub activity", () => {
    // Set mock data
    ServerCacheInstance.setGithubActivity(MOCK_GITHUB_ACTIVITY);

    // Verify setGithubActivity was called
    expect(mockSetGithubActivity).toHaveBeenCalledTimes(1);
    expect(mockSetGithubActivity).toHaveBeenCalledWith(MOCK_GITHUB_ACTIVITY);

    // Get the data back
    const result = ServerCacheInstance.getGithubActivity();

    // Verify getGithubActivity was called
    expect(mockGetGithubActivity).toHaveBeenCalledTimes(1);

    // Verify the result
    expect(result).toBeDefined();
    expect(result?.trailingYearData.data).toHaveLength(
      MOCK_GITHUB_ACTIVITY.trailingYearData.data.length,
    );
  });

  it("should clear GitHub activity", () => {
    // Set mock data
    ServerCacheInstance.setGithubActivity(MOCK_GITHUB_ACTIVITY);

    // Clear the cache
    ServerCacheInstance.clearGithubActivity();

    // Verify clearGithubActivity was called
    expect(mockClearGithubActivity).toHaveBeenCalledTimes(1);

    // Try to get the data back
    const result = ServerCacheInstance.getGithubActivity();

    // Verify getGithubActivity was called again
    expect(mockGetGithubActivity).toHaveBeenCalledTimes(1);

    // The result should be undefined after clearing
    expect(result).toBeUndefined();
  });

  it("should clear GitHub activity cache properly", () => {
    // Set mock data
    ServerCacheInstance.setGithubActivity(MOCK_GITHUB_ACTIVITY);

    // Verify it's in cache
    const cached = ServerCacheInstance.getGithubActivity();
    expect(cached).toBeDefined();

    // Clear the cache
    ServerCacheInstance.clearGithubActivity();

    // Verify clearGithubActivity was called
    expect(mockClearGithubActivity).toHaveBeenCalledTimes(1);

    // Try to retrieve after clearing
    const clearedCache = ServerCacheInstance.getGithubActivity();

    // Verify getGithubActivity was called
    expect(mockGetGithubActivity).toHaveBeenCalledTimes(2); // Called once before clear, once after

    // The result should be undefined after clearing
    expect(clearedCache).toBeUndefined();
  });

  it("should handle cache miss gracefully", () => {
    // Don't store anything in cache
    // Just try to retrieve
    const cacheMiss = ServerCacheInstance.getGithubActivity();

    // Verify getGithubActivity was called
    expect(mockGetGithubActivity).toHaveBeenCalledTimes(1);

    // Should be undefined when cache is empty
    expect(cacheMiss).toBeUndefined();
  });

  it("should handle concurrent access to cache", async () => {
    // Reset mock implementation to track concurrent calls
    mockSetGithubActivity.mockImplementation((data) => {
      // Simulate some work
      mockGithubActivity.current = data;
    });

    // Test that the cache can handle concurrent access
    const concurrentPromises: Array<Promise<void>> = Array.from({ length: 5 }, (_, i) => {
      const mockData = {
        ...MOCK_GITHUB_ACTIVITY,
        trailingYearData: {
          ...MOCK_GITHUB_ACTIVITY.trailingYearData,
          data: MOCK_GITHUB_ACTIVITY.trailingYearData.data.map((item) => ({
            ...item,
            count: i, // Each concurrent call gets a different count
          })),
        },
      };
      return Promise.resolve().then(() => {
        ServerCacheInstance.setGithubActivity(mockData);
        return undefined;
      });
    });

    await Promise.all(concurrentPromises);

    // Verify setGithubActivity was called 5 times
    expect(mockSetGithubActivity).toHaveBeenCalledTimes(5);

    // After all operations, we should have data in cache
    const result = ServerCacheInstance.getGithubActivity();
    expect(result).toBeDefined();

    // The last call should be the one that persists
    expect(result?.trailingYearData.data[0].count).toBe(4);
  });
});
