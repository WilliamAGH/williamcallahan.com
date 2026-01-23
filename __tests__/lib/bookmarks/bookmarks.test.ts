/**
 * @file Unit tests for bookmarks fetching logic.
 * This file focuses on the core bookmark fetching functionality,
 * specifically testing external API integration and data transformation.
 * @module __tests__/lib/bookmarks.test
 */

import { describe, beforeAll, beforeEach, afterEach, expect, it, jest } from "@jest/globals";
import type { UnifiedBookmark, BookmarkContent } from "../../../src/types";
import { ServerCacheInstance } from "@/lib/server-cache";

// Mock getBaseUrl at the top level with the correct path
jest.mock("@/lib/utils/get-base-url", () => ({
  getBaseUrl: () => "http://localhost:3000",
}));

// Mock the API endpoint
const API_ENDPOINT = "/api/bookmarks";
void API_ENDPOINT; // Explicitly mark as intentionally unused

// Mock server cache
jest.mock("@/lib/server-cache", () => ({
  ServerCacheInstance: {
    get: jest.fn(),
    set: jest.fn(),
    getStats: jest.fn().mockReturnValue({
      keys: 0,
      hits: 0,
      misses: 0,
      ksize: 0,
      vsize: 0,
      sizeBytes: 0,
      maxSizeBytes: 0,
      utilizationPercent: 0,
    }),
  },
}));

const mockedCache = ServerCacheInstance;
void mockedCache; // Explicitly mark as intentionally unused

// Define properly typed API response
const mockApiResponse: UnifiedBookmark[] = [
  {
    id: "bookmark1",
    modifiedAt: "2023-01-01T12:00:00Z",
    title: "Test Bookmark 1",
    url: "https://example.com/article1",
    description: "This is a test article description",
    archived: false,
    isFavorite: true,
    taggingStatus: "success",
    note: null,
    summary: "Test summary",
    dateBookmarked: "2023-01-01T12:00:00Z",
    sourceUpdatedAt: "2023-01-01T12:00:00Z",
    slug: "test-bookmark-1",
    tags: ["javascript", "web-development"],
    content: {
      type: "link",
      url: "https://example.com/article1",
      title: "Test Article 1",
      description: "This is a test article description",
      imageUrl: "https://example.com/image1.jpg",
      author: "John Doe",
      publisher: "Example Blog",
      datePublished: "2022-12-15T00:00:00Z",
    } as BookmarkContent,
    assets: [],
  },
  {
    id: "bookmark2",
    modifiedAt: "2023-01-02T12:00:00Z",
    title: "Test Article 2",
    url: "https://example.com/article2",
    description: "Description placeholder",
    archived: false,
    isFavorite: false,
    taggingStatus: "success",
    note: "My notes",
    summary: null,
    dateBookmarked: "2023-01-02T12:00:00Z",
    sourceUpdatedAt: "2023-01-02T12:00:00Z",
    slug: "test-article-2",
    tags: ["react"],
    content: {
      type: "link",
      url: "https://example.com/article2",
      title: "Test Article 2",
      description: "Description placeholder",
      author: null,
      publisher: null,
    } as BookmarkContent,
    assets: [],
  },
];

// Simplified mock response helper
const createMockResponse = (options: {
  ok: boolean;
  status?: number;
  statusText?: string;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}): Response => {
  // Use globalThis.Headers to ensure we get the polyfilled version
  const headers = globalThis.Headers ? new globalThis.Headers() : {};

  return {
    ok: options.ok,
    status: options.status ?? 200,
    statusText: options.statusText ?? "OK",
    headers,
    json: options.json ?? (() => Promise.resolve({})),
    text: options.text ?? (() => Promise.resolve("")),
  } as Response;
};

describe("Bookmarks Module (Simplified)", () => {
  beforeAll(() => {
    // Ensure fetch is defined on globalThis before tests run
    if (!globalThis.fetch) {
      const fetchMock = Object.assign(jest.fn(), { preconnect: jest.fn() });
      globalThis.fetch = fetchMock as unknown as typeof fetch;
    }
  });

  beforeEach(() => {
    // Reset module cache to ensure fresh imports
    jest.resetModules();

    // Set up environment
    process.env.BOOKMARK_BEARER_TOKEN = "test-token";

    // Fresh mocks are created inline as needed

    // Clear all existing mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clean up
    process.env.BOOKMARK_BEARER_TOKEN = undefined;
    jest.clearAllMocks();
  });

  it("should fetch bookmarks from API when no cache exists", async () => {
    // Set up fetch mock
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      createMockResponse({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      }),
    );

    try {
      // Import module after setting up mocks
      const { fetchBookmarksFromApi } = await import("../../../src/lib/bookmarks/bookmarks.client");

      const bookmarks = await fetchBookmarksFromApi();

      // Verify fetch was called
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/bookmarks$/),
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Accept: "application/json",
          }),
          cache: "no-store",
        }),
      );

      // Verify results
      expect(bookmarks).toBeDefined();
      expect(Array.isArray(bookmarks)).toBe(true);
      expect(bookmarks.length).toBe(2);
      expect(bookmarks[0]?.id).toBe("bookmark1");
      expect(bookmarks[0]?.title).toBe("Test Bookmark 1");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("should handle API fetch errors gracefully", async () => {
    // Set up fetch mock to reject
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      // Import module after setting up mocks
      const { fetchBookmarksFromApi } = await import("../../../src/lib/bookmarks/bookmarks.client");

      const bookmarks = await fetchBookmarksFromApi();

      // Verify fetch was called
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Should return empty array
      expect(bookmarks).toEqual([]);

      // Should log error
      expect(consoleSpy).toHaveBeenCalledWith(
        "[Bookmarks] [Client] Failed to fetch from /api/bookmarks:",
        expect.any(Error),
      );
    } finally {
      fetchSpy.mockRestore();
      consoleSpy.mockRestore();
    }
  });

  it("should handle API error responses", async () => {
    // Set up fetch mock to return error response
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      createMockResponse({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: () => Promise.resolve("Unauthorized"),
      }),
    );
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      // Import module after setting up mocks
      const { fetchBookmarksFromApi } = await import("../../../src/lib/bookmarks/bookmarks.client");

      const bookmarks = await fetchBookmarksFromApi();

      // Verify fetch was called
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Should return empty array
      expect(bookmarks).toEqual([]);

      // Should log error
      expect(consoleSpy).toHaveBeenCalledWith(
        "[Bookmarks] [Client] Failed to fetch from /api/bookmarks:",
        expect.any(Error),
      );
    } finally {
      fetchSpy.mockRestore();
      consoleSpy.mockRestore();
    }
  });

  it("should handle API server errors", async () => {
    // Mock API to return a server error (which would happen if BOOKMARK_BEARER_TOKEN is missing server-side)
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      createMockResponse({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: () => Promise.resolve("Server configuration error"),
      }),
    );
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      // Import module after setting up environment
      const { fetchBookmarksFromApi } = await import("../../../src/lib/bookmarks/bookmarks.client");

      const bookmarks = await fetchBookmarksFromApi();

      // Should return empty array
      expect(bookmarks).toEqual([]);

      // Should log error
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Failed to fetch from"), expect.any(Error));
    } finally {
      fetchSpy.mockRestore();
      consoleSpy.mockRestore();
    }
  });

  it("should handle API response with minimal data", async () => {
    // Set up fetch mock with minimal response
    const minimalResponse = [
      {
        id: "minimal",
        modifiedAt: "2023-01-01T12:00:00Z",
        title: "Minimal bookmark",
        url: "https://example.com/minimal",
        description: "",
        dateBookmarked: "2023-01-01T12:00:00Z",
        sourceUpdatedAt: "2023-01-01T12:00:00Z",
        slug: "minimal",
        tags: [],
      },
    ];

    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      createMockResponse({
        ok: true,
        json: () => Promise.resolve(minimalResponse),
      }),
    );

    try {
      // Import module after setting up mocks
      const { fetchBookmarksFromApi } = await import("../../../src/lib/bookmarks/bookmarks.client");

      const bookmarks = await fetchBookmarksFromApi();

      // Verify fetch was called
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Should return array with minimal data
      expect(Array.isArray(bookmarks)).toBe(true);
      expect(bookmarks.length).toBe(1);
      expect(bookmarks[0]?.id).toBe("minimal");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  describe("handleBookmarkApiResponse", () => {
    it("should return data from { data: [...] } responses", async () => {
      const { handleBookmarkApiResponse } = await import("../../../src/lib/bookmarks/api-client");
      const response = createMockResponse({
        ok: true,
        json: () => Promise.resolve({ data: mockApiResponse }),
      });

      const result = await handleBookmarkApiResponse(response, "test-data-wrapper");
      expect(result).toEqual(mockApiResponse);
    });

    it("should return data from { bookmarks: [...] } responses", async () => {
      const { handleBookmarkApiResponse } = await import("../../../src/lib/bookmarks/api-client");
      const response = createMockResponse({
        ok: true,
        json: () => Promise.resolve({ bookmarks: mockApiResponse }),
      });

      const result = await handleBookmarkApiResponse(response, "test-bookmarks-wrapper");
      expect(result).toEqual(mockApiResponse);
    });
  });
});
