/**
 * Bookmarks Client API
 *
 * Client-side API wrapper for fetching bookmark data
 * Handles API communication for bookmark operations
 *
 * @module lib/bookmarks.client
 */

import type { UnifiedBookmark } from "@/types";
import { callBookmarksApi, getLogPrefix } from "./api-client";

/**
 * Fetches bookmarks from the API endpoint for client-side use
 *
 * @param endpoint - The API endpoint to call (defaults to /api/bookmarks)
 * @returns Promise resolving to array of bookmarks
 */
export async function fetchBookmarksFromApi(endpoint = "/api/bookmarks"): Promise<UnifiedBookmark[]> {
  console.log(`${getLogPrefix("Client")} Fetching bookmarks from API endpoint (${endpoint})`);

  try {
    const bookmarks = await callBookmarksApi(endpoint);
    console.log(`${getLogPrefix("Client")} Received ${bookmarks.length} bookmarks from API`);
    return bookmarks;
  } catch (error) {
    // Ensure error details are surfaced for easier debugging (client-side)
    // Even though callBookmarksApi already logs the same error on the server-side,
    // logging it again here guarantees the message is captured in tests that invoke
    // the client wrapper directly without going through the full data-access layer.
    console.error(`${getLogPrefix()} Failed to fetch from ${endpoint}:`, error);

    // Return an empty array so that consuming components can handle the failure
    // gracefully without additional try/catch logic.
    return [];
  }
}
