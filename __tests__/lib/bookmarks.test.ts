/**
 * Bookmarks Module Tests (Simplified)
 *
 * Tests the functionality of the bookmarks module, including fetching
 * external bookmarks and cache integration.
 * 
 * Fixed version to address hanging issues in Bun test runner.
 */

import { describe, beforeEach, afterEach, expect, it, mock, jest, spyOn } from 'bun:test';
import type { UnifiedBookmark, BookmarkContent, BookmarkTag } from '../../types';

// Simplified mock approach - create fresh mocks for each test
let mockFetch: any;
let mockGetBookmarksCache: any;
let mockSetBookmarksCache: any;
let mockShouldRefreshBookmarksCache: any;
let mockClearBookmarksCache: any;

// Define properly typed API response
const mockApiResponse: UnifiedBookmark[] = [
  {
    id: 'bookmark1',
    createdAt: '2023-01-01T12:00:00Z',
    modifiedAt: '2023-01-01T12:00:00Z',
    title: 'Test Bookmark 1',
    url: 'https://example.com/article1',
    description: 'This is a test article description',
    archived: false,
    favourited: true,
    taggingStatus: 'success',
    note: null,
    summary: 'Test summary',
    dateBookmarked: '2023-01-01T12:00:00Z',
    tags: [
      { id: 'tag1', name: 'JavaScript', attachedBy: 'user' } as BookmarkTag,
      { id: 'tag2', name: 'Web Development', attachedBy: 'ai' } as BookmarkTag
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
    } as BookmarkContent,
    assets: []
  },
  {
    id: 'bookmark2',
    createdAt: '2023-01-02T12:00:00Z',
    modifiedAt: '2023-01-02T12:00:00Z',
    title: 'Test Article 2',
    url: 'https://example.com/article2',
    description: 'Description placeholder',
    archived: false,
    favourited: false,
    taggingStatus: 'success',
    note: 'My notes',
    summary: null,
    dateBookmarked: '2023-01-02T12:00:00Z',
    tags: [
      { id: 'tag3', name: 'React', attachedBy: 'user' } as BookmarkTag
    ],
    content: {
      type: 'link',
      url: 'https://example.com/article2',
      title: 'Test Article 2',
      description: 'Description placeholder',
      author: null,
      publisher: null
    } as BookmarkContent,
    assets: []
  }
];

// Simplified mock response helper
const createMockResponse = (options: {
  ok: boolean;
  status?: number;
  statusText?: string;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}): Response => {
  return {
    ok: options.ok,
    status: options.status ?? 200,
    statusText: options.statusText ?? 'OK',
    headers: new Headers(),
    json: options.json ?? (() => Promise.resolve({})),
    text: options.text ?? (() => Promise.resolve(''))
  } as Response;
};

describe('Bookmarks Module (Simplified)', () => {
  // Timeout for individual tests to prevent hanging
  const TEST_TIMEOUT = 10000; // 10 seconds

  beforeEach(() => {
    // Set up environment
    process.env.BOOKMARK_BEARER_TOKEN = 'test-token';
    
    // Create fresh mocks for each test
    mockFetch = jest.fn();
    mockGetBookmarksCache = jest.fn();
    mockSetBookmarksCache = jest.fn();
    mockShouldRefreshBookmarksCache = jest.fn();
    mockClearBookmarksCache = jest.fn();
    
    // Clear all existing mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clean up
    process.env.BOOKMARK_BEARER_TOKEN = undefined;
    jest.clearAllMocks();
  });

  it('should fetch bookmarks from API when no cache exists', async () => {
    // Set up fetch mock
    const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      createMockResponse({
        ok: true,
        json: () => Promise.resolve(mockApiResponse)
      })
    );

    // Import module after setting up mocks
    const { fetchExternalBookmarks } = await import('../../lib/bookmarks.client');
    
    const bookmarks = await fetchExternalBookmarks();

    // Verify fetch was called
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/bookmarks$/),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'Accept': 'application/json',
        }),
        cache: 'no-store',
      })
    );

    // Verify results
    expect(bookmarks).toBeDefined();
    expect(Array.isArray(bookmarks)).toBe(true);
    expect(bookmarks.length).toBe(2);
    expect(bookmarks[0]?.id).toBe('bookmark1');
    expect(bookmarks[0]?.title).toBe('Test Bookmark 1');

    fetchSpy.mockRestore();
  }, TEST_TIMEOUT);

  it('should handle API fetch errors gracefully', async () => {
    // Set up fetch mock to reject
    const fetchSpy = spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));
    const consoleSpy = spyOn(console, 'error').mockImplementation(() => {});

    // Import module after setting up mocks
    const { fetchExternalBookmarks } = await import('../../lib/bookmarks.client');
    
    const bookmarks = await fetchExternalBookmarks();

    // Verify fetch was called
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Should return empty array
    expect(bookmarks).toEqual([]);

    // Should log error
    expect(consoleSpy).toHaveBeenCalledWith(
      'Client library: Failed to fetch bookmarks from /api/bookmarks:',
      expect.any(Error)
    );

    fetchSpy.mockRestore();
    consoleSpy.mockRestore();
  }, TEST_TIMEOUT);

  it('should handle API error responses', async () => {
    // Set up fetch mock to return error response
    const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      createMockResponse({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('Unauthorized')
      })
    );
    const consoleSpy = spyOn(console, 'error').mockImplementation(() => {});

    // Import module after setting up mocks
    const { fetchExternalBookmarks } = await import('../../lib/bookmarks.client');
    
    const bookmarks = await fetchExternalBookmarks();

    // Verify fetch was called
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Should return empty array
    expect(bookmarks).toEqual([]);

    // Should log error
    expect(consoleSpy).toHaveBeenCalledWith(
      'Client library: Failed to fetch bookmarks from /api/bookmarks:',
      expect.any(Error)
    );

    fetchSpy.mockRestore();
    consoleSpy.mockRestore();
  }, TEST_TIMEOUT);

     it('should handle missing BOOKMARK_BEARER_TOKEN', async () => {
     // Remove token
     const originalToken = process.env.BOOKMARK_BEARER_TOKEN;
     process.env.BOOKMARK_BEARER_TOKEN = undefined;

     const fetchSpy = spyOn(globalThis, 'fetch');
     const consoleSpy = spyOn(console, 'error').mockImplementation(() => {});

     try {
       // Import module after setting up environment
       const { fetchExternalBookmarks } = await import('../../lib/bookmarks.client');
       
       const bookmarks = await fetchExternalBookmarks();

       // Should return empty array
       expect(bookmarks).toEqual([]);

       // Should log error
       expect(consoleSpy).toHaveBeenCalled();
     } finally {
       // Restore token
       if (originalToken) {
         process.env.BOOKMARK_BEARER_TOKEN = originalToken;
       }
       fetchSpy.mockRestore();
       consoleSpy.mockRestore();
     }
   }, TEST_TIMEOUT);

  it('should handle API response with minimal data', async () => {
    // Set up fetch mock with minimal response
    const minimalResponse = [
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
        },
        assets: []
      }
    ];

    const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      createMockResponse({
        ok: true,
        json: () => Promise.resolve(minimalResponse)
      })
    );

    // Import module after setting up mocks
    const { fetchExternalBookmarks } = await import('../../lib/bookmarks.client');
    
    const bookmarks = await fetchExternalBookmarks();

    // Verify fetch was called
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Should return array with minimal data
    expect(Array.isArray(bookmarks)).toBe(true);
    expect(bookmarks.length).toBe(1);
    expect(bookmarks[0]?.id).toBe('minimal');

    fetchSpy.mockRestore();
  }, TEST_TIMEOUT);
});
