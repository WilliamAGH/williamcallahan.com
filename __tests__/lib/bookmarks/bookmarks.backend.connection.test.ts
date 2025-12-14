/**
 * @file Integration tests for the bookmarks API backend connection.
 * These tests verify that the application can successfully connect to the external
 * bookmarks API, fetch data, and handle pagination using cursors.
 * It requires `BOOKMARK_BEARER_TOKEN` and `BOOKMARKS_LIST_ID` environment variables to be set.
 */
import type { ApiResponse, RawApiBookmark } from "../../../src/lib/bookmarks";

/**
 * Test suite for verifying the connection and data retrieval from the external bookmarks API.
 */
describe.skip("Bookmarks API Backend Connection", () => {
  const BOOKMARK_BEARER_TOKEN = process.env.BOOKMARK_BEARER_TOKEN;
  const BOOKMARKS_LIST_ID = process.env.BOOKMARKS_LIST_ID;
  /**
   * The base API endpoint for fetching bookmarks for the configured list ID.
   * @internal
   */
  const API_ENDPOINT = `https://bookmark.iocloudhost.net/api/v1/lists/${BOOKMARKS_LIST_ID}/bookmarks`;

  /**
   * Test case to verify that the API returns a 200 OK status,
   * and that all bookmarks can be fetched and parsed correctly using cursor-based pagination.
   * It also checks if a minimum number of bookmarks are retrieved and logs details of the first bookmark.
   */
  it("should return a 200 OK status code and parse all bookmarks using cursor", async () => {
    let allBookmarks: RawApiBookmark[] = [];
    const cursor: string | null = null; // Initial cursor is null
    let page = 1;
    const limit = 20; // Number of bookmarks to fetch per page
    const expectedMinBookmarks = 25; // Minimum number of bookmarks expected to be fetched

    /**
     * Fetches all bookmarks from the API, handling pagination using cursors.
     * Accumulates bookmarks into the `allBookmarks` array.
     * @async
     * @internal
     */
    const fetchAllBookmarks = async () => {
      let nextCursor: string | null = cursor; // Start with the initial cursor (null), explicitly typed
      let hasMore = true;

      while (hasMore) {
        const url = nextCursor
          ? `${API_ENDPOINT}?limit=${limit}&cursor=${nextCursor}`
          : `${API_ENDPOINT}?limit=${limit}`;

        console.log(`Fetching page ${page} with URL: ${url}`);

        const response = await fetch(url, {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${BOOKMARK_BEARER_TOKEN}`,
          },
        });

        expect(response.status).toBe(200);
        const contentType = response.headers.get("content-type");
        expect(contentType).toEqual(expect.stringContaining("application/json"));

        const jsonResponse: unknown = await response.json();
        // Explicitly assert the type on a new line
        const data = jsonResponse as ApiResponse;

        expect(Array.isArray(data.bookmarks)).toBe(true);

        allBookmarks = allBookmarks.concat(data.bookmarks);
        nextCursor = data.nextCursor || null;
        console.log(`Next cursor: ${nextCursor}`);
        hasMore = !!nextCursor;
        page++;
      }
    };

    await fetchAllBookmarks();

    const bookmarkCount = allBookmarks.length;
    console.log(`Total number of bookmarks: ${bookmarkCount}`);

    expect(bookmarkCount).toBeGreaterThanOrEqual(expectedMinBookmarks);

    if (bookmarkCount > 0) {
      const firstBookmark = allBookmarks[0];

      console.log(`First bookmark ID: ${firstBookmark.id}`);

      if (firstBookmark.tags && firstBookmark.tags.length > 0) {
        console.log(`First tag name: ${firstBookmark.tags[0].name}`);
        console.log(`First tag attachedBy: ${firstBookmark.tags[0].attachedBy}`);
      }

      if (firstBookmark.content) {
        console.log(`First bookmark content type: ${firstBookmark.content.type}`);
        console.log(`First bookmark content url: ${firstBookmark.content.url}`);
        console.log(`First bookmark content title: ${firstBookmark.content.title}`);
        console.log(`First bookmark content description: ${firstBookmark.content.description}`);
        console.log(`First bookmark content imageUrl: ${firstBookmark.content.imageUrl}`);
        if (firstBookmark.content.htmlContent) {
          console.log(
            `First bookmark content htmlContent (truncated): ${firstBookmark.content.htmlContent.substring(0, 30)}`,
          );
        } else {
          console.log("First bookmark content htmlContent: null");
        }
      }
    }
  });
});
