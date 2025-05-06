/**
 * Tests for the Bookmarks API Route
 * @module __tests__/api/bookmarks/route.test
 */

import { mock, jest, describe, beforeEach, it, expect, spyOn, afterEach } from 'bun:test';
import { GET } from '../../../../app/api/bookmarks/route';
import type { UnifiedBookmark } from '../../../../types';

// Mock dependencies using mock.module
mock.module('../../../../lib/bookmarks', () => ({
  fetchExternalBookmarks: jest.fn()
}));
mock.module('../../../../lib/server-cache', () => ({
  ServerCacheInstance: {
    getBookmarks: jest.fn(),
  }
}));
mock.module('next/server', () => ({
  NextResponse: {
    json: jest.fn(),
  },
}));

// Import *after* mocking
import { fetchExternalBookmarks as ImportedFetchBookmarks } from '../../../../lib/bookmarks';
import { ServerCacheInstance as ImportedServerCache } from '../../../../lib/server-cache';
import { NextResponse as ImportedNextResponse } from 'next/server';

// Spy on console (no need to mock the whole object)
let consoleLogSpy: ReturnType<typeof spyOn>;
let consoleErrorSpy: ReturnType<typeof spyOn>;

// Get handles to the mocks
const mockFetchBookmarks = ImportedFetchBookmarks as jest.Mock;
const mockGetCache = ImportedServerCache.getBookmarks as jest.Mock;
const mockResponseJson = ImportedNextResponse.json as jest.Mock;

describe('GET /api/bookmarks', () => {
  const mockBookmarksData: UnifiedBookmark[] = [
    { id: '1', title: 'Bookmark 1', url: 'https://example.com/1' } as UnifiedBookmark,
    { id: '2', title: 'Bookmark 2', url: 'https://example.com/2' } as UnifiedBookmark,
  ];
  const mockCachedData: UnifiedBookmark[] = [
    { id: 'cached1', title: 'Cached Bookmark 1', url: 'https://cached.com/1' } as UnifiedBookmark,
  ];
  const cacheHeaders = { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=3600' };

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    mockFetchBookmarks.mockClear();
    mockGetCache.mockClear();
    mockResponseJson.mockClear();

    // Setup spies
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore spies
    consoleLogSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
  });

  it('should return fetched bookmarks on success', async () => {
    mockFetchBookmarks.mockResolvedValue(mockBookmarksData);

    await GET();

    expect(mockFetchBookmarks).toHaveBeenCalledTimes(1);
    expect(mockGetCache).not.toHaveBeenCalled();
    expect(mockResponseJson).toHaveBeenCalledWith(mockBookmarksData, { status: 200, headers: cacheHeaders });
    expect(consoleLogSpy).toHaveBeenCalledWith('API route: Starting to fetch bookmarks');
    expect(consoleLogSpy).toHaveBeenCalledWith(`API route: Fetched ${mockBookmarksData.length} bookmarks`);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should return cached bookmarks when fetch fails but cache exists', async () => {
    const fetchError = new Error('Fetch failed');
    mockFetchBookmarks.mockRejectedValue(fetchError);
    mockGetCache.mockReturnValue({ bookmarks: mockCachedData });

    await GET();

    expect(mockFetchBookmarks).toHaveBeenCalledTimes(1);
    expect(mockGetCache).toHaveBeenCalledTimes(1);
    expect(mockResponseJson).toHaveBeenCalledWith(mockCachedData, { status: 200, headers: cacheHeaders });
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error fetching bookmarks:', fetchError);
    expect(consoleLogSpy).toHaveBeenCalledWith(`API route: Returning stale cached bookmarks, count: ${mockCachedData.length}`);
  });

  it('should return 500 error when fetch fails and cache is empty', async () => {
    const fetchError = new Error('Fetch failed');
    mockFetchBookmarks.mockRejectedValue(fetchError);
    mockGetCache.mockReturnValue(undefined); // No cache

    await GET();

    expect(mockFetchBookmarks).toHaveBeenCalledTimes(1);
    expect(mockGetCache).toHaveBeenCalledTimes(1);
    expect(mockResponseJson).toHaveBeenCalledWith({ error: 'Fetch failed' }, { status: 500 });
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error fetching bookmarks:', fetchError);
    expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('Returning stale cached'));
  });

  it('should return 500 error when fetch fails and cache has empty array', async () => {
    const fetchError = new Error('Fetch failed');
    mockFetchBookmarks.mockRejectedValue(fetchError);
    mockGetCache.mockReturnValue({ bookmarks: [] }); // Cache exists but is empty

    await GET();

    expect(mockFetchBookmarks).toHaveBeenCalledTimes(1);
    expect(mockGetCache).toHaveBeenCalledTimes(1);
    expect(mockResponseJson).toHaveBeenCalledWith({ error: 'Fetch failed' }, { status: 500 });
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error fetching bookmarks:', fetchError);
  });

  it('should return 500 with generic message for non-Error objects', async () => {
    const fetchError = 'Something went wrong'; // Not an Error instance
    mockFetchBookmarks.mockRejectedValue(fetchError);
    mockGetCache.mockReturnValue(undefined);

    await GET();

    expect(mockResponseJson).toHaveBeenCalledWith({ error: 'Unknown error' }, { status: 500 });
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error fetching bookmarks:', fetchError);
  });
});