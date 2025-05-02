/**
 * Bookmarks Module Tests
 *
 * Tests the functionality of the bookmarks module, including fetching
 * external bookmarks and cache integration.
 */

import { fetchExternalBookmarks } from '../../lib/bookmarks';
import { ServerCacheInstance } from '../../lib/server-cache';
import { BOOKMARKS_CACHE_DURATION } from '../../lib/constants';

// Helper functions to manipulate mock state, ignoring TypeScript for test purposes
// These would normally be defined as part of the ServerCache interface, but for this file we use any
const mockHelpers = ServerCacheInstance as any;

// Mock server-cache
jest.mock('../../lib/server-cache', () => {
  const mockBookmarks: any[] = [];
  let mockShouldRefresh = true;
  
  return {
    ServerCacheInstance: {
      getBookmarks: jest.fn().mockImplementation(() => {
        return mockBookmarks.length ? {
          bookmarks: mockBookmarks,
          lastFetchedAt: Date.now() - 1000,
          lastAttemptedAt: Date.now() - 1000
        } : undefined;
      }),
      setBookmarks: jest.fn().mockImplementation((bookmarks: any[], isFailure = false) => {
        if (!isFailure) {
          mockBookmarks.splice(0, mockBookmarks.length, ...bookmarks);
        }
      }),
      shouldRefreshBookmarks: jest.fn().mockImplementation(() => mockShouldRefresh),
      clearBookmarks: jest.fn(),
      // Test helper methods (not in actual implementation)
      _mockSetRefreshState: (shouldRefresh: boolean) => {
        mockShouldRefresh = shouldRefresh;
      },
      _mockSetBookmarks: (bookmarks: any[]) => {
        mockBookmarks.splice(0, mockBookmarks.length, ...bookmarks);
      },
      _mockClearBookmarks: () => {
        mockBookmarks.splice(0, mockBookmarks.length);
      }
    },
    __esModule: true
  };
});

// Mock for fetch
global.fetch = jest.fn();

// Mock console.log and console.error
console.log = jest.fn();
console.error = jest.fn();

describe('Bookmarks Module', () => {
  const mockApiResponse = {
    bookmarks: [
      {
        id: 'bookmark1',
        createdAt: '2023-01-01T12:00:00Z',
        modifiedAt: '2023-01-01T12:00:00Z',
        title: 'Test Bookmark 1',
        archived: false,
        favourited: true,
        taggingStatus: 'success',
        note: null,
        summary: 'Test summary',
        tags: [
          { id: 'tag1', name: 'JavaScript', attachedBy: 'user' },
          { id: 'tag2', name: 'Web Development', attachedBy: 'ai' }
        ],
        content: {
          type: 'link',
          url: 'https://example.com/article1',
          title: 'Test Article 1',
          description: 'This is a test article description',
          imageUrl: 'https://example.com/image1.jpg',
          author: 'John Doe',
          publisher: 'Example Blog',
          datePublished: '2022-12-15T00:00:00Z'
        },
        assets: []
      },
      {
        id: 'bookmark2',
        createdAt: '2023-01-02T12:00:00Z',
        modifiedAt: '2023-01-02T12:00:00Z',
        title: null,
        archived: false,
        favourited: false,
        taggingStatus: 'success',
        note: 'My notes',
        summary: null,
        tags: [
          { id: 'tag3', name: 'React', attachedBy: 'user' }
        ],
        content: {
          type: 'link',
          url: 'https://example.com/article2',
          title: 'Test Article 2',
          description: null,
          author: null,
          publisher: null
        },
        assets: []
      }
    ],
    nextCursor: null
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset environment variables
    process.env.BOOKMARK_BEARER_TOKEN = 'test-token';
    // Reset the cache
    mockHelpers._mockClearBookmarks();
    mockHelpers._mockSetRefreshState(true);
    // Reset fetch mock
    (global.fetch as jest.Mock).mockReset();
  });

  it('should fetch bookmarks from API when cache is empty', async () => {
    // Mock API response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockApiResponse
    });

    const bookmarks = await fetchExternalBookmarks();
    
    // Verify it fetched from API
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('bookmark.iocloudhost.net'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-token'
        })
      })
    );
    
    // Verify it returned normalized bookmarks
    expect(bookmarks.length).toBe(2);
    expect(bookmarks[0].id).toBe('bookmark1');
    expect(bookmarks[0].title).toBe('Test Bookmark 1'); // Prioritizing raw.title
    expect(bookmarks[0].tags.length).toBe(2);
    
    // Verify it called setBookmarks to store in cache
    expect(ServerCacheInstance.setBookmarks).toHaveBeenCalledTimes(1);
    expect(ServerCacheInstance.setBookmarks).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 'bookmark1' }),
        expect.objectContaining({ id: 'bookmark2' })
      ])
    );
  });

  it('should return cached bookmarks when available and no refresh needed', async () => {
    // Set up mock cached data
    const cachedBookmarks = [
      {
        id: 'cached1',
        title: 'Cached Bookmark 1',
        url: 'https://example.com/cached1',
        description: 'Cached description',
        tags: [{ id: 'tag1', name: 'Cached', attachedBy: 'user' }],
        createdAt: '2023-01-01T12:00:00Z',
        content: {
          url: 'https://example.com/cached1',
          title: 'Cached Bookmark 1',
          description: 'Cached description'
        }
      }
    ];
    
    mockHelpers._mockSetBookmarks(cachedBookmarks);
    mockHelpers._mockSetRefreshState(false);
    
    const bookmarks = await fetchExternalBookmarks();
    
    // Verify it did not fetch from API
    expect(global.fetch).not.toHaveBeenCalled();
    
    // Verify it returned cached bookmarks
    expect(bookmarks.length).toBe(1);
    expect(bookmarks[0].id).toBe('cached1');
    
    // Verify the logs
    expect(console.log).toHaveBeenCalledWith('Using cached bookmarks data');
  });

  it('should use cached data while refreshing in background when cache exists but needs refresh', async () => {
    // Set up mock cached data
    const cachedBookmarks = [
      {
        id: 'cached1',
        title: 'Cached Bookmark 1',
        url: 'https://example.com/cached1',
        description: 'Cached description',
        tags: [{ id: 'tag1', name: 'Cached', attachedBy: 'user' }],
        createdAt: '2023-01-01T12:00:00Z',
        content: {
          url: 'https://example.com/cached1',
          title: 'Cached Bookmark 1',
          description: 'Cached description'
        }
      }
    ];
    
    mockHelpers._mockSetBookmarks(cachedBookmarks);
    mockHelpers._mockSetRefreshState(true);
    
    // Mock API response (for background refresh)
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockApiResponse
    });
    
    const bookmarks = await fetchExternalBookmarks();
    
    // Verify it returned cached bookmarks immediately
    expect(bookmarks.length).toBe(1);
    expect(bookmarks[0].id).toBe('cached1');
    
    // Verify the logs
    expect(console.log).toHaveBeenCalledWith('Using cached bookmarks while refreshing in background');
    
    // Wait for background refresh to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify it did fetch from API in the background
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('should handle missing BOOKMARK_BEARER_TOKEN', async () => {
    // Remove token
    delete process.env.BOOKMARK_BEARER_TOKEN;
    
    const bookmarks = await fetchExternalBookmarks();
    
    // Verify it did not fetch from API
    expect(global.fetch).not.toHaveBeenCalled();
    
    // Verify it returned empty array
    expect(bookmarks).toEqual([]);
    
    // Verify it logged error
    expect(console.error).toHaveBeenCalledWith('BOOKMARK_BEARER_TOKEN environment variable is not set.');
    
    // Verify it called setBookmarks with empty array and true for isFailure
    expect(ServerCacheInstance.setBookmarks).toHaveBeenCalledWith([], true);
  });

  it('should handle API fetch errors', async () => {
    // Mock API error
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
    
    // Clear any cached bookmarks first
    mockHelpers._mockClearBookmarks();
    
    const bookmarks = await fetchExternalBookmarks();
    
    // Should return empty array
    expect(bookmarks).toEqual([]);
    
    // Verify it logged error
    expect(console.error).toHaveBeenCalledWith(
      'Failed to fetch bookmarks with no cache available:',
      expect.any(Error)
    );
    
    // Verify it called setBookmarks with empty array and true for isFailure
    expect(ServerCacheInstance.setBookmarks).toHaveBeenCalledWith([], true);
  });

  it('should handle API error responses', async () => {
    // Clear any cached bookmarks first
    mockHelpers._mockClearBookmarks();
    
    // Mock API error response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized'
    });
    
    // With no cache, fetchExternalBookmarks will try to fetch and return empty when failed
    const bookmarks = await fetchExternalBookmarks();
    
    // Should return empty array
    expect(bookmarks).toEqual([]);
    
    // Verify it logged error
    expect(console.error).toHaveBeenCalledWith(
      'Failed to fetch bookmarks with no cache available:',
      expect.any(Error)
    );
    
    // Verify it called setBookmarks with empty array and true for isFailure
    expect(ServerCacheInstance.setBookmarks).toHaveBeenCalledWith([], true);
  });

  it('should handle API response with missing fields', async () => {
    // Mock API response with minimal data
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        bookmarks: [
          {
            id: 'minimal',
            createdAt: '2023-01-01T12:00:00Z',
            modifiedAt: '2023-01-01T12:00:00Z',
            title: null,
            archived: false,
            favourited: false,
            taggingStatus: 'success',
            tags: [],
            content: {
              type: 'link',
              url: 'https://example.com/minimal'
              // Title and description missing
            },
            assets: []
          }
        ]
      })
    });
    
    const bookmarks = await fetchExternalBookmarks();
    
    // Verify it handled missing fields with fallbacks
    expect(bookmarks.length).toBe(1);
    expect(bookmarks[0].id).toBe('minimal');
    expect(bookmarks[0].title).toBe('Untitled Bookmark');
    expect(bookmarks[0].description).toBe('No description available.');
  });

  it('should use cached data as fallback when API call fails and cache exists', async () => {
    // Set up mock cached data
    const cachedBookmarks = [
      {
        id: 'cached1',
        title: 'Cached Bookmark 1',
        url: 'https://example.com/cached1',
        description: 'Cached description',
        tags: [{ id: 'tag1', name: 'Cached', attachedBy: 'user' }],
        createdAt: '2023-01-01T12:00:00Z',
        content: {
          url: 'https://example.com/cached1',
          title: 'Cached Bookmark 1',
          description: 'Cached description'
        }
      }
    ];
    
    mockHelpers._mockSetBookmarks(cachedBookmarks);
    
    // Mock failed API response for background refresh
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
    
    const bookmarks = await fetchExternalBookmarks();
    
    // Verify it returned cached bookmarks
    expect(bookmarks.length).toBe(1);
    expect(bookmarks[0].id).toBe('cached1');
    
    // Wait for background refresh attempt to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify error was logged from background refresh
    expect(console.error).toHaveBeenCalledWith('Background refresh of bookmarks failed:', expect.any(Error));
  });
});