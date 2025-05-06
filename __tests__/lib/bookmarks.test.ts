/**
 * Bookmarks Module Tests
 *
 * Tests the functionality of the bookmarks module, including fetching
 * external bookmarks and cache integration.
 */

// import { fetchExternalBookmarks } from '../../lib/bookmarks'; // Import below after mocking
import { BOOKMARKS_CACHE_DURATION } from '../../lib/constants';
import { mock, jest, spyOn, describe, beforeEach, afterEach, expect, it } from 'bun:test'; // Use bun:test imports

// Explicitly mock assertServerOnly for this test file
mock.module('../../lib/utils/ensure-server-only', () => ({
  assertServerOnly: jest.fn(() => undefined)
}));

// Declare mockHelpers before the server-cache mock
const mockHelpers: any = {};

// Mock server-cache using mock.module
mock.module('../../lib/server-cache', () => { // Use mock.module
  const mockBookmarks: any[] = [];
  let mockShouldRefresh = true;

  // Create mock functions using jest.fn()
  const mockGetBookmarks = jest.fn(() => {
    return mockBookmarks.length ? {
      bookmarks: mockBookmarks,
      lastFetchedAt: Date.now() - 1000,
      lastAttemptedAt: Date.now() - 1000
    } : undefined;
  });
  const mockSetBookmarks = jest.fn((bookmarks: any[], isFailure = false) => {
    if (!isFailure) {
      mockBookmarks.splice(0, mockBookmarks.length, ...bookmarks);
    }
  });
  const mockShouldRefreshBookmarks = jest.fn(() => mockShouldRefresh);
  const mockClearBookmarks = jest.fn(() => {
    mockBookmarks.length = 0; // Clear the array
  });

  // Assign helper methods directly to the pre-declared mockHelpers object
  mockHelpers._mockSetRefreshState = (shouldRefresh: boolean) => {
    mockShouldRefresh = shouldRefresh;
  };
  mockHelpers._mockSetBookmarks = (bookmarks: any[]) => {
    mockBookmarks.splice(0, mockBookmarks.length, ...bookmarks);
  };
  mockHelpers._mockClearBookmarks = () => {
    mockBookmarks.splice(0, mockBookmarks.length);
  };

  return {
    // Export the mocked instance with mocked methods
    ServerCacheInstance: {
      getBookmarks: mockGetBookmarks,
      setBookmarks: mockSetBookmarks,
      shouldRefreshBookmarks: mockShouldRefreshBookmarks,
      clearBookmarks: mockClearBookmarks,
      // Add other methods if needed by the tested code
    },
    __esModule: true
  };
});

// Import fetchExternalBookmarks *after* mocks are set up
import { fetchExternalBookmarks } from '../../lib/bookmarks';
import { ServerCacheInstance } from '../../lib/server-cache'; // Import the mocked instance

// Remove the later assignment of mockHelpers
// const mockHelpers = ServerCacheInstance as any; // This line is removed

// Remove global fetch mock: global.fetch = jest.fn();

// Spies for console, setup in beforeEach
let consoleLogSpy: ReturnType<typeof spyOn>;
let consoleErrorSpy: ReturnType<typeof spyOn>;

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
    // Reset the cache helpers (if they track state outside the mock module)
    mockHelpers._mockClearBookmarks();
    mockHelpers._mockSetRefreshState(true);
    // Reset fetch spy if used (fetchSpy.mockReset();)
    // Setup console spies
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console spies
    consoleLogSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
    // Restore fetch spy if created (fetchSpy?.mockRestore();)
  });

  it('should fetch bookmarks from API when cache is empty', async () => {
    // Spy on global fetch for this test
    const fetchSpy = spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockApiResponse
    } as Response); // Cast to Response type

    const bookmarks = await fetchExternalBookmarks();

    // Verify fetch was called
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
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
    fetchSpy.mockRestore(); // Restore fetch spy
  });

  it('should return cached bookmarks when available and no refresh needed', async () => {
    // Spy on global fetch to ensure it's NOT called
    const fetchSpy = spyOn(global, 'fetch');

    // Set up mock cached data
    const cachedBookmarks: any = [
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

    // Verify fetch was NOT called
    expect(fetchSpy).not.toHaveBeenCalled();

    // Verify it returned cached bookmarks
    expect(bookmarks.length).toBe(1);
    expect(bookmarks[0].id).toBe('cached1');

    // Verify the logs using the spy
    expect(consoleLogSpy).toHaveBeenCalledWith('Using cached bookmarks data');
    fetchSpy.mockRestore(); // Restore fetch spy
  });

  it('should handle missing BOOKMARK_BEARER_TOKEN', async () => {
    // Spy on global fetch to ensure it's NOT called
    const fetchSpy = spyOn(global, 'fetch');
    // Remove token
    delete process.env.BOOKMARK_BEARER_TOKEN;

    const bookmarks = await fetchExternalBookmarks();

    // Verify fetch was NOT called
    expect(fetchSpy).not.toHaveBeenCalled();

    // Verify it returned empty array
    expect(bookmarks).toEqual([]);

    // Verify it logged error using spy
    expect(consoleErrorSpy).toHaveBeenCalledWith('BOOKMARK_BEARER_TOKEN environment variable is not set.');

    // Verify it called setBookmarks with empty array and true for isFailure
    expect(ServerCacheInstance.setBookmarks).toHaveBeenCalledWith([], true);
    fetchSpy.mockRestore(); // Restore fetch spy
  });

  it('should handle API fetch errors', async () => {
    // Spy on global fetch and make it reject
    const fetchSpy = spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    // Clear any cached bookmarks first
    mockHelpers._mockClearBookmarks();

    const bookmarks = await fetchExternalBookmarks();

    // Verify fetch was called
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Should return empty array
    expect(bookmarks).toEqual([]);

    // Verify it logged error using spy
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to fetch bookmarks with no cache available:',
      expect.any(Error)
    );

    // Verify it called setBookmarks with empty array and true for isFailure
    expect(ServerCacheInstance.setBookmarks).toHaveBeenCalledWith([], true);
    fetchSpy.mockRestore(); // Restore fetch spy
  });

  it('should handle API error responses', async () => {
    // Clear any cached bookmarks first
    mockHelpers._mockClearBookmarks();

    // Spy on global fetch and return error response
    const fetchSpy = spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized'
    } as Response); // Cast to Response

    // With no cache, fetchExternalBookmarks will try to fetch and return empty when failed
    const bookmarks = await fetchExternalBookmarks();

    // Verify fetch was called
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Should return empty array
    expect(bookmarks).toEqual([]);

    // Verify it logged error using spy
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to fetch bookmarks with no cache available:',
      expect.any(Error)
    );

    // Verify it called setBookmarks with empty array and true for isFailure
    expect(ServerCacheInstance.setBookmarks).toHaveBeenCalledWith([], true);
    fetchSpy.mockRestore(); // Restore fetch spy
  });

  it('should handle API response with missing fields', async () => {
    // Spy on global fetch and return minimal data
    const fetchSpy = spyOn(global, 'fetch').mockResolvedValueOnce({
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
    } as Response); // Cast to Response

    const bookmarks = await fetchExternalBookmarks();

    // Verify fetch was called
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Verify it handled missing fields with fallbacks
    expect(bookmarks.length).toBe(1);
    expect(bookmarks[0].id).toBe('minimal');
    expect(bookmarks[0].title).toBe('Untitled Bookmark');
    expect(bookmarks[0].description).toBe('No description available.');
    fetchSpy.mockRestore(); // Restore fetch spy
  });

  it.skip('should use cached data while refreshing in background when cache exists but needs refresh', async () => {
    // Spy on global fetch and make it reject for the background refresh
    const fetchSpy = spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'));

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
    ] as any[];

    // Populate cache and flag it for refresh
    mockHelpers._mockSetBookmarks(cachedBookmarks);
    mockHelpers._mockSetRefreshState(true);

    // Calling fetchExternalBookmarks returns the cached data immediately
    const result = await fetchExternalBookmarks();
    expect(result).toEqual(cachedBookmarks);

    // Wait for the background refresh to execute and log its error
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(consoleErrorSpy).toHaveBeenCalledWith('Background refresh of bookmarks failed:', expect.any(Error));
    fetchSpy.mockRestore();
  });
});
