/**
 * GitHub Activity API Cache Tests
 * 
 * Tests the caching functionality for GitHub activity data
 * Validates ServerCacheInstance methods for GitHub activity storage and retrieval
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import type { GitHubActivityApiResponse } from '../../../../types/github';
const mockGithubActivity: { current: GitHubActivityApiResponse | undefined } = { current: undefined };
let lastFetchedAt = Date.now();

// Create mock functions
const mockSetGithubActivity = mock((activity: GitHubActivityApiResponse) => {
  mockGithubActivity.current = activity;
  lastFetchedAt = Date.now();
});

const mockGetGithubActivity = mock(() => {
  if (!mockGithubActivity.current) return undefined;
  return {
    ...mockGithubActivity.current,
    lastFetchedAt,
    lastAttemptedAt: lastFetchedAt,
    timestamp: lastFetchedAt,
  };
});

const mockClearGithubActivity = mock(() => {
  mockGithubActivity.current = undefined;
});

const mockGetStats = mock(() => ({ hits: 0, misses: 0, keys: 0, ksize: 0, vsize: 0 }));

// Mock the server-cache module
mock.module('../../../../lib/server-cache', () => ({
  ServerCacheInstance: {
    setGithubActivity: mockSetGithubActivity,
    getGithubActivity: mockGetGithubActivity,
    clearGithubActivity: mockClearGithubActivity,
    getStats: mockGetStats,
  },
  __esModule: true,
}));

// Import the mocked ServerCacheInstance after the mock is defined
import { ServerCacheInstance } from '../../../../lib/server-cache';
import { CacheTester } from '../../../../lib/test-utils/cache-tester';

// Skip these tests if we're not in the correct environment
const shouldSkip = process.env.NODE_ENV === 'production';

// Check for required API credentials
const hasApiCredentials = Boolean(process.env.GITHUB_ACCESS_TOKEN_COMMIT_GRAPH);

// Mock GitHub activity data
const MOCK_GITHUB_ACTIVITY: GitHubActivityApiResponse = {
  trailingYearData: {
    source: 'api',
    data: [
      {
        date: '2023-01-01',
        count: 5,
        level: 2
      }
    ],
    totalContributions: 100,
    dataComplete: true
  },
  cumulativeAllTimeData: {
  source: 'api',
  data: [
    {
      date: '2023-01-01',
      count: 5,
      level: 2
    }
  ],
  totalContributions: 100,
  dataComplete: true
  }
};

// Use describe.skip if needed OR if we are temporarily disabling these tests
if (shouldSkip) {
  describe.skip('GitHub Activity API Cache Tests (Skipped in Production)', () => {
    it('skipped in production', () => {});
  });
} else {
  describe('GitHub Activity API Cache Tests', () => {
    beforeEach(() => {
      // Reset mocks and clear state before each test
      mockSetGithubActivity.mockClear();
      mockGetGithubActivity.mockClear();
      mockClearGithubActivity.mockClear();
      mockGetStats.mockClear();
      mockGithubActivity.current = undefined;
    });

    it('should set and get GitHub activity', async () => {
      // Set mock data
      await ServerCacheInstance.setGithubActivity(MOCK_GITHUB_ACTIVITY);

      // Verify setGithubActivity was called
      expect(mockSetGithubActivity).toHaveBeenCalledTimes(1);
      expect(mockSetGithubActivity).toHaveBeenCalledWith(MOCK_GITHUB_ACTIVITY);

      // Get the data back
      const result = ServerCacheInstance.getGithubActivity();

      // Verify getGithubActivity was called
      expect(mockGetGithubActivity).toHaveBeenCalledTimes(1);

      // Verify the result
      expect(result).toBeDefined();
      expect(result?.trailingYearData.data).toHaveLength(MOCK_GITHUB_ACTIVITY.trailingYearData.data.length);

    });

    it('should clear GitHub activity', async () => {
      // Set mock data
      await ServerCacheInstance.setGithubActivity(MOCK_GITHUB_ACTIVITY);

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

    it('should clear GitHub activity cache properly', async () => {
      // Set mock data
      await ServerCacheInstance.setGithubActivity(MOCK_GITHUB_ACTIVITY);

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

    it('should handle cache miss gracefully', () => {
      // Don't store anything in cache
      // Just try to retrieve
      const cacheMiss = ServerCacheInstance.getGithubActivity();

      // Verify getGithubActivity was called
      expect(mockGetGithubActivity).toHaveBeenCalledTimes(1);

      // Should be undefined when cache is empty
      expect(cacheMiss).toBeUndefined();
    });

    it('should handle concurrent access to cache', async () => {
      // Reset mock implementation to track concurrent calls
      mockSetGithubActivity.mockImplementation(async (data) => {
        // Simulate some async work
        await new Promise(resolve => setTimeout(resolve, 10));
        mockGithubActivity.current = data;
      });

      // Test that the cache can handle concurrent access
      const concurrentPromises = Array(5).fill(0).map((_, i) => {
        const mockData = {
          ...MOCK_GITHUB_ACTIVITY,
          trailingYearData: {
            ...MOCK_GITHUB_ACTIVITY.trailingYearData,
            data: MOCK_GITHUB_ACTIVITY.trailingYearData.data.map(item => ({
              ...item,
              count: i // Each concurrent call gets a different count
            }))
          }
        };
        return ServerCacheInstance.setGithubActivity(mockData);
      });

      await Promise.all(concurrentPromises);

      // Verify setGithubActivity was called 5 times
      expect(mockSetGithubActivity).toHaveBeenCalledTimes(5);

      // After all operations, we should have data in cache
      const result = ServerCacheInstance.getGithubActivity();
      expect(result).toBeDefined();

      // The last call should be the one that persists
      const lastCall = mockSetGithubActivity.mock.calls[4][0];
      expect(result?.trailingYearData.data[0].count).toBe(4);
    });

    it('should clear GitHub activity cache properly', async () => { // Added async
      // Store data in cache
      await ServerCacheInstance.setGithubActivity(MOCK_GITHUB_ACTIVITY); // Added await

      // Verify it's in cache
      expect(ServerCacheInstance.getGithubActivity()).not.toBeUndefined();

      // Clear the cache using the mocked instance's method for consistency in this test suite
      ServerCacheInstance.clearGithubActivity();

      // Verify clearGithubActivity was called
      expect(mockClearGithubActivity).toHaveBeenCalledTimes(1);

      // Verify it's no longer in cache
      expect(ServerCacheInstance.getGithubActivity()).toBeUndefined();
    });
  });
}
