// __tests__/bookmarks.backend.connection.test.ts
import request from 'node-fetch';

describe('Bookmarks API Backend Connection', () => {
  const BOOKMARK_BEARER_TOKEN = process.env.BOOKMARK_BEARER_TOKEN;
  const BOOKMARKS_LIST_ID = process.env.BOOKMARKS_LIST_ID;
  const API_ENDPOINT = `https://bookmark.iocloudhost.net/api/v1/lists/${BOOKMARKS_LIST_ID}/bookmarks`;

  it('should return a 200 OK status code and parse all bookmarks using cursor', async () => {
    let allBookmarks: any[] = [];
    let cursor: string | null = null;
    let page = 1;
    const limit = 20; // Set a limit to fetch more bookmarks per page
    const expectedMinBookmarks = 25;

    const fetchAllBookmarks = async () => {
      let nextCursor = cursor;
      let hasMore = true;

      while (hasMore) {
        const url = nextCursor
          ? `${API_ENDPOINT}?limit=${limit}&cursor=${nextCursor}`
          : `${API_ENDPOINT}?limit=${limit}`;

        console.log(`Fetching page ${page} with URL: ${url}`);

        const response = await request(url, {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${BOOKMARK_BEARER_TOKEN}`,
          },
        });

        expect(response.status).toBe(200);
        const contentType = response.headers.get("content-type");
        expect(contentType).toEqual(expect.stringContaining("application/json"));

        const data = await response.json();
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
          console.log(`First bookmark content htmlContent (truncated): ${firstBookmark.content.htmlContent.substring(0, 30)}`);
        } else {
          console.log(`First bookmark content htmlContent: null`);
        }
      }
    }
  });
});
