/**
 * Tests for the Bookmarks API Route
 * @module __tests__/api/bookmarks/route.test
 */

import { GET } from '../../../../app/api/bookmarks/route';
import { fetchExternalBookmarks } from '../../../../lib/bookmarks';
import { ServerCacheInstance } from '../../../../lib/server-cache';
import { NextResponse } from 'next/server';
import type { UnifiedBookmark } from '../../../../types';

// Mock dependencies
jest.mock('../../../../lib/utils/ensure-server-only', () => ({
  assertServerOnly: jest.fn(),
}));
jest.mock('../../../../lib/bookmarks');
jest.mock('../../../../lib/server-cache');
jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn(),
  },
}));

// Mock console
global.console = { ...console, log: jest.fn(), error: jest.fn() };

const mockFetchBookmarks = fetchExternalBookmarks as jest.Mock;
const mockGetCache = ServerCacheInstance.getBookmarks as jest.Mock;
const mockResponseJson = NextResponse.json as jest.Mock;

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
  });

  it('should return fetched bookmarks on success', async () => {
    mockFetchBookmarks.mockResolvedValue(mockBookmarksData);

    await GET();

    expect(mockFetchBookmarks).toHaveBeenCalledTimes(1);
    expect(mockGetCache).not.toHaveBeenCalled();
    expect(mockResponseJson).toHaveBeenCalledWith(mockBookmarksData, { status: 200, headers: cacheHeaders });
    expect(console.log).toHaveBeenCalledWith('API route: Starting to fetch bookmarks');
    expect(console.log).toHaveBeenCalledWith(`API route: Fetched ${mockBookmarksData.length} bookmarks`);
    expect(console.error).not.toHaveBeenCalled();
  });

  it('should return cached bookmarks when fetch fails but cache exists', async () => {
    const fetchError = new Error('Fetch failed');
    mockFetchBookmarks.mockRejectedValue(fetchError);
    mockGetCache.mockReturnValue({ bookmarks: mockCachedData });

    await GET();

    expect(mockFetchBookmarks).toHaveBeenCalledTimes(1);
    expect(mockGetCache).toHaveBeenCalledTimes(1);
    expect(mockResponseJson).toHaveBeenCalledWith(mockCachedData, { status: 200, headers: cacheHeaders });
    expect(console.error).toHaveBeenCalledWith('Error fetching bookmarks:', fetchError);
    expect(console.log).toHaveBeenCalledWith(`API route: Returning stale cached bookmarks, count: ${mockCachedData.length}`);
  });

  it('should return 500 error when fetch fails and cache is empty', async () => {
    const fetchError = new Error('Fetch failed');
    mockFetchBookmarks.mockRejectedValue(fetchError);
    mockGetCache.mockReturnValue(undefined); // No cache

    await GET();

    expect(mockFetchBookmarks).toHaveBeenCalledTimes(1);
    expect(mockGetCache).toHaveBeenCalledTimes(1);
    expect(mockResponseJson).toHaveBeenCalledWith({ error: 'Fetch failed' }, { status: 500 });
    expect(console.error).toHaveBeenCalledWith('Error fetching bookmarks:', fetchError);
    expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('Returning stale cached'));
  });

  it('should return 500 error when fetch fails and cache has empty array', async () => {
    const fetchError = new Error('Fetch failed');
    mockFetchBookmarks.mockRejectedValue(fetchError);
    mockGetCache.mockReturnValue({ bookmarks: [] }); // Cache exists but is empty

    await GET();

    expect(mockFetchBookmarks).toHaveBeenCalledTimes(1);
    expect(mockGetCache).toHaveBeenCalledTimes(1);
    expect(mockResponseJson).toHaveBeenCalledWith({ error: 'Fetch failed' }, { status: 500 });
    expect(console.error).toHaveBeenCalledWith('Error fetching bookmarks:', fetchError);
  });

  it('should return 500 with generic message for non-Error objects', async () => {
    const fetchError = 'Something went wrong'; // Not an Error instance
    mockFetchBookmarks.mockRejectedValue(fetchError);
    mockGetCache.mockReturnValue(undefined);

    await GET();

    expect(mockResponseJson).toHaveBeenCalledWith({ error: 'Unknown error' }, { status: 500 });
    expect(console.error).toHaveBeenCalledWith('Error fetching bookmarks:', fetchError);
  });
});