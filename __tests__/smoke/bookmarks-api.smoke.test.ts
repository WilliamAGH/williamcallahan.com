/**
 * Smoke tests for external Bookmarks API backend connectivity
 *
 * Validates real connection to the bookmarks API service:
 * - API authentication with bearer token
 * - Cursor-based pagination handling
 * - Response schema validation
 * - Minimum data availability checks
 *
 * Requires environment variables:
 * - BOOKMARK_BEARER_TOKEN: API authentication token
 * - BOOKMARKS_LIST_ID: Target bookmark list identifier
 *
 * Skips automatically when credentials are not available (CI/local without secrets)
 *
 * @fileoverview External API connectivity smoke test for bookmarks backend
 */

import type { BookmarksApiResponse, RawApiBookmark } from "@/types/bookmark";

const BOOKMARK_BEARER_TOKEN = process.env.BOOKMARK_BEARER_TOKEN;
const BOOKMARKS_LIST_ID = process.env.BOOKMARKS_LIST_ID;

const hasCredentials = Boolean(BOOKMARK_BEARER_TOKEN && BOOKMARKS_LIST_ID);

/**
 * Smoke test suite for bookmarks API backend connectivity
 *
 * Tests real external API connection when credentials are available.
 * Automatically skipped in environments without API credentials.
 */
describe.skipIf(!hasCredentials)("Bookmarks API Backend Connection", () => {
  const API_ENDPOINT = `https://bookmark.iocloudhost.net/api/v1/lists/${BOOKMARKS_LIST_ID}/bookmarks`;

  // Extended timeout for external API calls with pagination
  vi.setConfig({ testTimeout: 60000 });

  it("should connect and fetch all bookmarks via cursor pagination", async () => {
    const allBookmarks: RawApiBookmark[] = [];
    let nextCursor: string | null = null;
    let page = 1;
    const limit = 20;
    const expectedMinBookmarks = 25;

    // Fetch all pages using cursor-based pagination
    let hasMore = true;
    while (hasMore) {
      const url = nextCursor
        ? `${API_ENDPOINT}?limit=${limit}&cursor=${nextCursor}`
        : `${API_ENDPOINT}?limit=${limit}`;

      console.log(`[Smoke] Fetching page ${page}: ${url}`);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${BOOKMARK_BEARER_TOKEN}`,
        },
      });

      // Validate response status
      expect(response.status).toBe(200);

      // Validate content type
      const contentType = response.headers.get("content-type");
      expect(contentType).toEqual(expect.stringContaining("application/json"));

      // Parse and validate response structure
      const data = (await response.json()) as BookmarksApiResponse;
      expect(Array.isArray(data.bookmarks)).toBe(true);

      allBookmarks.push(...data.bookmarks);
      nextCursor = data.nextCursor || null;
      hasMore = Boolean(nextCursor);
      page++;
    }

    // Validate minimum data availability
    const bookmarkCount = allBookmarks.length;
    console.log(`[Smoke] Total bookmarks fetched: ${bookmarkCount}`);
    expect(bookmarkCount).toBeGreaterThanOrEqual(expectedMinBookmarks);

    // Validate first bookmark structure
    if (bookmarkCount > 0) {
      const first = allBookmarks[0];
      expect(first).toHaveProperty("id");
      expect(first).toHaveProperty("content");

      if (first.content) {
        expect(first.content).toHaveProperty("url");
        expect(first.content).toHaveProperty("title");
      }
    }
  });

  it("should return 401 with invalid token", async () => {
    const response = await fetch(`${API_ENDPOINT}?limit=1`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: "Bearer invalid-token-12345",
      },
    });

    expect(response.status).toBe(401);
  });
});
