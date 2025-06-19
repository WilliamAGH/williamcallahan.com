/**
 * @file Bookmarks API and data management.
 * This module is responsible for fetching bookmarks from an external API (Hoarder/Karakeep),
 * normalizing the data, caching it (in-memory and S3), and providing functions
 * to access this data. It handles pagination, error fallbacks, and background refreshing.
 * @module lib/bookmarks
 */

import { BOOKMARKS_S3_PATHS, BOOKMARKS_API_CONFIG } from "@/lib/constants";
import { readJsonS3 } from "@/lib/s3-utils";
import { normalizeBookmarks } from "./normalize";
import { processBookmarksInBatches } from "./enrich-opengraph";

import type { UnifiedBookmark, RawApiBookmark, BookmarksApiResponse as ApiResponse } from "@/types/bookmark";

/**
 * @deprecated Use fetchBookmarks from service.server.ts instead
 * This function is kept for backward compatibility during migration
 */
export { fetchBookmarks as fetchExternalBookmarks } from "./service.server";

/**
 * Refreshes bookmarks data directly from the external API, normalizes it,
 * updates the S3 storage, and then updates the in-memory server cache (ServerCacheInstance).
 * This function handles API pagination and includes a timeout for each page request.
 *
 * @returns {Promise<UnifiedBookmark[]>} A promise that resolves to an array of newly fetched and normalized unified bookmarks.
 * @throws {Error} If any critical step fails (e.g., API request, S3 write, critical config missing).
 *                 It attempts to provide S3 fallback data in console logs but still throws for primary failures.
 */
export async function refreshBookmarksData(): Promise<UnifiedBookmark[]> {
  console.log("[refreshBookmarksData] Starting refresh cycle from external API...");

  // Read configuration from constants
  const bookmarksListId = BOOKMARKS_API_CONFIG.LIST_ID;
  if (!bookmarksListId) {
    console.error("[refreshBookmarksData] CRITICAL_CONFIG: BOOKMARKS_LIST_ID environment variable is not set.");
    throw new Error("BOOKMARKS_LIST_ID environment variable must be set to your list ID");
  }
  const apiUrl = `${BOOKMARKS_API_CONFIG.API_URL}/lists/${bookmarksListId}/bookmarks`;

  const bearerToken = BOOKMARKS_API_CONFIG.BEARER_TOKEN;
  if (!bearerToken) {
    console.error("[refreshBookmarksData] CRITICAL_CONFIG: BOOKMARK_BEARER_TOKEN environment variable is not set.");
    throw new Error("BOOKMARK_BEARER_TOKEN environment variable is not set. Cannot fetch bookmarks.");
  }

  const requestHeaders = {
    Accept: "application/json",
    Authorization: `Bearer ${bearerToken}`,
  };

  let primaryFetchError: Error | null = null;

  try {
    console.log(`[refreshBookmarksData] Fetching all bookmarks from API: ${apiUrl}`);
    const allRawBookmarks: RawApiBookmark[] = [];
    let cursor: string | null = null;
    let pageCount = 0;

    do {
      pageCount++;
      const pageUrl = cursor ? `${apiUrl}?cursor=${encodeURIComponent(cursor)}` : apiUrl;
      console.log(`[refreshBookmarksData] Fetching page ${pageCount}: ${pageUrl}`);
      const pageController = new AbortController();
      const pageTimeoutId = setTimeout(() => {
        console.warn(`[refreshBookmarksData] Aborting fetch for page ${pageUrl} due to 10s timeout.`);
        pageController.abort();
      }, BOOKMARKS_API_CONFIG.REQUEST_TIMEOUT_MS as number);

      let pageResponse: Response;
      try {
        pageResponse = await fetch(pageUrl, {
          method: "GET",
          headers: requestHeaders,
          signal: pageController.signal,
          redirect: "follow",
        });
      } finally {
        clearTimeout(pageTimeoutId);
      }

      if (!pageResponse.ok) {
        const responseText = await pageResponse.text();
        const apiError = new Error(
          `API request to ${pageUrl} failed with status ${pageResponse.status}: ${responseText}`,
        );
        console.error("[refreshBookmarksData] External API request error:", apiError.message);
        throw apiError;
      }

      const data: ApiResponse = (await pageResponse.json()) as ApiResponse;
      console.log(
        `[refreshBookmarksData] Retrieved ${data.bookmarks.length} bookmarks from page ${pageCount}. Next cursor: '${data.nextCursor}'`,
      );
      allRawBookmarks.push(...data.bookmarks);
      cursor = data.nextCursor;
    } while (cursor);

    console.log(
      `[refreshBookmarksData] Total raw bookmarks fetched across ${pageCount} pages: ${allRawBookmarks.length}`,
    );

    // First pass: normalize bookmarks without OpenGraph data
    const normalizedBookmarks = normalizeBookmarks(allRawBookmarks);

    console.log(`[refreshBookmarksData] Successfully normalized ${normalizedBookmarks.length} bookmarks.`);

    // Apply test limit if set
    const isNonProd = process.env.NODE_ENV !== "production";
    const testLimit = isNonProd && process.env.S3_TEST_LIMIT ? Number.parseInt(process.env.S3_TEST_LIMIT, 10) : 0;
    let bookmarksToProcess = normalizedBookmarks;
    if (testLimit > 0) {
      bookmarksToProcess = normalizedBookmarks.slice(0, testLimit);
      console.log(
        `[refreshBookmarksData] Test mode active: limiting processing from ${normalizedBookmarks.length} to ${bookmarksToProcess.length} bookmark(s).`,
      );
    }

    console.log(`[refreshBookmarksData] Starting OpenGraph enrichment for ${bookmarksToProcess.length} bookmarks...`);

    // Second pass: enrich with OpenGraph data using batched processing
    const isDev = process.env.NODE_ENV === "development";
    const enrichedBookmarks = await processBookmarksInBatches(bookmarksToProcess, isDev);

    console.log(`[refreshBookmarksData] OpenGraph enrichment completed for ${enrichedBookmarks.length} bookmarks.`);

    console.log("[refreshBookmarksData] Refresh cycle completed successfully.");
    return enrichedBookmarks;
  } catch (error) {
    primaryFetchError = error instanceof Error ? error : new Error(String(error));
    console.error(
      `[refreshBookmarksData] PRIMARY_FETCH_FAILURE: Error during external API fetch or processing: ${primaryFetchError.message}`,
      primaryFetchError,
    );

    // Fallback: attempt to return existing S3 data for resilience, but primary mission failed.
    try {
      console.log("[refreshBookmarksData] Attempting to load fallback data from S3 due to primary fetch failure.");
      const s3Backup = await readJsonS3<UnifiedBookmark[]>(BOOKMARKS_S3_PATHS.FILE);
      if (Array.isArray(s3Backup) && s3Backup.length > 0) {
        console.log(
          `[refreshBookmarksData] S3_FALLBACK_SUCCESS: Successfully loaded ${s3Backup.length} bookmarks from S3 as fallback.`,
        );
        // Even if S3 fallback works, the cron job's primary task (fresh refresh) failed.
        // So, we re-throw the original primaryFetchError to signal this to the cron runner.
        // Other direct callers of this function might handle the returned s3Backup differently if no error is thrown.
        // For the cron path, failure means failure.
      } else {
        console.warn(
          "[refreshBookmarksData] S3_FALLBACK_NODATA: S3 fallback attempted but no data was found or data was empty.",
        );
      }
    } catch (s3ReadError) {
      console.error("[refreshBookmarksData] S3_FALLBACK_FAILURE: Error reading fallback S3 data:", s3ReadError);
    }

    // Always re-throw the primary fetch error so the cron job knows the refresh didn't complete as intended.
    throw primaryFetchError;
  }
}
