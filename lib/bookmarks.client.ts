/**
 * Bookmarks Client API
 *
 * Client-side API wrapper for fetching bookmark data
 * Handles caching, static site generation support, and external API interactions
 *
 * @module lib/bookmarks.client
 */

import type { UnifiedBookmark } from "@/types";
import { getBaseUrl } from "./getBaseUrl";
import { ServerCacheInstance } from "./server-cache";

/**
 * Fetches all bookmarks from our backend API endpoint
 *
 * Endpoint handles differential updates and local persistence
 * Designed for client-side use
 */
export async function fetchExternalBookmarks(): Promise<UnifiedBookmark[]> {
  // Check cache first, similar to server-side logic for background refresh
  const cachedData = ServerCacheInstance.getBookmarks();
  if (
    cachedData?.bookmarks &&
    cachedData.bookmarks.length > 0 &&
    ServerCacheInstance.shouldRefreshBookmarks()
  ) {
    console.log("Client library: Using cached bookmarks while refreshing in background via API");
    // Trigger API call but don't await it if we're returning cached data
    fetch(`${getBaseUrl()}/api/bookmarks?refresh=true`, {
      // Assuming refresh=true triggers the full refresh cycle on the server
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    }).catch((error) => {
      console.error("Client library: Background refresh via /api/bookmarks failed:", error);
    });
    return [...cachedData.bookmarks]; // Return a copy
  }

  try {
    // Always use API endpoint if not handling background refresh above
    console.log("Client library: Fetching bookmarks from API endpoint (/api/bookmarks)");
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/api/bookmarks`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store", // Ensure we get the latest from our API, which handles its own caching/persistence
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `API request to /api/bookmarks failed with status ${response.status}: ${errorText}`,
      );
    }

    const data = (await response.json()) as UnifiedBookmark[] | { bookmarks?: UnifiedBookmark[] };
    console.log("Client library: Received response from /api/bookmarks with", data);

    // Handle cases where API might return { bookmarks: [] } or just []
    if (Array.isArray(data)) {
      return data;
    }
    if (data && Array.isArray(data.bookmarks)) {
      return data.bookmarks;
    }
    console.warn(
      "Client library: Received non-array/non-standard data from /api/bookmarks, returning empty array.",
    );
    return [];
  } catch (error) {
    console.error("Client library: Failed to fetch bookmarks from /api/bookmarks:", error);
    return [];
  }
}

/**
 * Fetches bookmarks, utilizing in-memory cache first
 *
 * Falls back to backend API if cache is empty
 */
export async function fetchExternalBookmarksCached(): Promise<UnifiedBookmark[]> {
  try {
    console.log("Client library: Attempting to fetch cached bookmarks (memory first)");

    const cached = ServerCacheInstance.getBookmarks();
    if (cached && Array.isArray(cached.bookmarks) && cached.bookmarks.length > 0) {
      // Optional: Add a timestamp to the cache and check for staleness if needed
      // For now, if it's in memory, use it.
      console.log(`Client library: Using memory-cached bookmarks (${cached.bookmarks.length})`);
      return cached.bookmarks;
    }

    console.log(
      "Client library: No suitable memory cache, fetching fresh data via fetchExternalBookmarks()",
    );
    const bookmarks = await fetchExternalBookmarks();
    // Update memory cache with freshly fetched data
    if (bookmarks.length > 0) {
      ServerCacheInstance.setBookmarks(bookmarks);
      console.log(
        `Client library: Updated memory cache with ${bookmarks.length} bookmarks after fetch.`,
      );
    }
    return bookmarks;
  } catch (error) {
    console.error("Client library: Failed to fetch cached bookmarks:", error);
    return [];
  }
}

/**
 * Triggers a refresh of bookmarks data by calling the API endpoint
 *
 * API handles refresh from external source and updates persistent store
 * Updates client-side in-memory cache with refreshed data
 */
export async function refreshBookmarksData(): Promise<UnifiedBookmark[]> {
  try {
    // Always use API endpoint
    console.log("Client library: Triggering refresh of bookmarks data via /api/bookmarks");
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/api/bookmarks?refresh=true`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `API request to /api/bookmarks?refresh=true failed with status ${response.status}: ${errorText}`,
      );
    }

    const bookmarks = (await response.json()) as unknown;

    if (Array.isArray(bookmarks)) {
      const typedBookmarks = bookmarks as UnifiedBookmark[];
      console.log(
        `Client library: Refreshed ${typedBookmarks.length} bookmarks successfully from API.`,
      );
      ServerCacheInstance.setBookmarks(typedBookmarks); // Update memory cache
      console.log(
        `Client library: Updated memory cache with ${typedBookmarks.length} refreshed bookmarks.`,
      );
      return typedBookmarks;
    }

    throw new Error("No valid bookmarks array received from refresh operation via API");
  } catch (error) {
    console.error("Client library: Failed to refresh bookmarks data:", error);
    throw error; // Re-throw to let the caller handle it
  }
}
