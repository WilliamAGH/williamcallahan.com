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
import { createHash } from "node:crypto";
import { writeJsonS3 } from "@/lib/s3-utils";

import type { UnifiedBookmark, RawApiBookmark, BookmarksApiResponse as ApiResponse } from "@/types/bookmark";

// Prefix for transient raw data cache during refresh process
const RAW_CACHE_PREFIX = "json/bookmarks/raw";

/**
 * @deprecated Use getBookmarks from service.server.ts instead
 * This function is kept for backward compatibility during migration
 */
export { getBookmarks as fetchExternalBookmarks } from "./service.server";

/**
 * Refreshes bookmarks data directly from the external API, normalizes it,
 * updates the S3 storage, and then updates the in-memory server cache (ServerCacheInstance).
 * This function handles API pagination and includes a timeout for each page request.
 *
 * @returns {Promise<UnifiedBookmark[]>} A promise that resolves to an array of newly fetched and normalized unified bookmarks.
 * @throws {Error} If any critical step fails (e.g., API request, S3 write, critical config missing).
 *                 It attempts to provide S3 fallback data in console logs but still throws for primary failures.
 */
export async function refreshBookmarksData(force = false): Promise<UnifiedBookmark[]> {
  console.log(`[refreshBookmarksData] Starting refresh cycle from external API... (force: ${force})`);

  // Read configuration from constants
  const bookmarksListId = BOOKMARKS_API_CONFIG.LIST_ID;
  if (!bookmarksListId) {
    console.error("[refreshBookmarksData] CRITICAL_CONFIG: BOOKMARKS_LIST_ID environment variable is not set.");
    console.warn(
      "[refreshBookmarksData] Returning empty array due to missing BOOKMARKS_LIST_ID. Check deployment environment variables.",
    );
    return [];
  }
  const apiUrl = `${BOOKMARKS_API_CONFIG.API_URL}/lists/${bookmarksListId}/bookmarks`;

  const bearerToken = BOOKMARKS_API_CONFIG.BEARER_TOKEN;
  if (!bearerToken) {
    console.error("[refreshBookmarksData] CRITICAL_CONFIG: BOOKMARK_BEARER_TOKEN environment variable is not set.");
    console.warn(
      "[refreshBookmarksData] Returning empty array due to missing BOOKMARK_BEARER_TOKEN. Check deployment environment variables.",
    );
    return [];
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
      console.log(`[refreshBookmarksData] Retrieved ${data.bookmarks.length} bookmarks from page ${pageCount}.`);
      allRawBookmarks.push(...data.bookmarks);
      cursor = data.nextCursor;

      // If the cursor is missing but there are bookmarks, it implies an incomplete fetch.
      if (!cursor && data.bookmarks.length > 0) {
        console.error(
          `CRITICAL_API_FAILURE: Bookmark API did not return a nextCursor on page ${pageCount}. The data fetch may be incomplete. Full response:`,
          JSON.stringify(data, null, 2),
        );
      }
    } while (cursor);

    console.log(
      `[refreshBookmarksData] Total raw bookmarks fetched across ${pageCount} pages: ${allRawBookmarks.length}`,
    );

    // -------------------------------------------------------------
    // Incremental short-circuit: if raw data checksum unchanged
    // -------------------------------------------------------------
    const rawJsonString = JSON.stringify(allRawBookmarks);
    const rawChecksum = createHash("sha256").update(rawJsonString).digest("hex");
    const latestKey = `${RAW_CACHE_PREFIX}/LATEST.json`;

    if (!force) {
      try {
        const latest = await readJsonS3<{ checksum: string; key: string }>(latestKey);
        if (latest?.checksum === rawChecksum) {
          const cached = await readJsonS3<UnifiedBookmark[]>(BOOKMARKS_S3_PATHS.FILE);

          // Only short-circuit when the *persisted* manifest length matches the
          // newly fetched raw count.  This guards against scenarios where a
          // previous dev-mode run wrote a truncated dataset (e.g., 20 items)
          // even though the raw API data is unchanged and complete.
          if (cached && cached.length === allRawBookmarks.length) {
            console.log(
              `[refreshBookmarksData] Raw checksum unchanged (${rawChecksum}) and manifest already contains ${cached.length} records – reuse without re-processing.`,
            );
            return cached;
          }

          console.warn(
            `[refreshBookmarksData] Raw checksum unchanged but manifest size mismatch (cached: ${cached?.length ?? 0}, expected: ${allRawBookmarks.length}). Proceeding with normalization & enrichment to correct the dataset.`,
          );
          // Fallthrough – continue with full pipeline so we rewrite the correct data.
        }
      } catch (err) {
        // Non-fatal – proceed to full refresh.
        console.warn("[refreshBookmarksData] Could not read raw LATEST checksum:", String(err));
      }
    } else {
      console.log("[refreshBookmarksData] Force refresh requested, skipping checksum check.");
    }

    // First pass: normalize bookmarks without OpenGraph data
    const normalizedBookmarks = normalizeBookmarks(allRawBookmarks);

    console.log(`[refreshBookmarksData] Successfully normalized ${normalizedBookmarks.length} bookmarks.`);

    // -------------------------------------------------------------------------
    // Development-time memory safeguard
    // -------------------------------------------------------------------------
    // In local development we previously applied an *implicit* limit of 20
    // bookmarks to avoid blowing up memory when enriching OpenGraph data.  That
    // safeguard unintentionally propagated to the S3 artifacts and caused the
    // live dataset to be truncated, which broke pagination (the UI believed
    // only 20 bookmarks existed).  We now require **explicit** developer intent
    // via the `S3_TEST_LIMIT` env var instead of silently capping.
    const isNonProd = process.env.NODE_ENV !== "production";
    let testLimit = 0;
    if (isNonProd && process.env.S3_TEST_LIMIT) {
      const parsed = Number.parseInt(process.env.S3_TEST_LIMIT, 10);
      testLimit = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    }

    let bookmarksToProcess = normalizedBookmarks;
    if (testLimit > 0) {
      bookmarksToProcess = normalizedBookmarks.slice(0, testLimit);
      console.log(
        `[refreshBookmarksData] Dev mode limit: processing ${bookmarksToProcess.length} of ${normalizedBookmarks.length} bookmarks to prevent high memory usage.`,
      );
    }

    console.log(`[refreshBookmarksData] Starting OpenGraph enrichment for ${bookmarksToProcess.length} bookmarks...`);

    // Second pass: enrich with OpenGraph data using batched processing
    const isDev = process.env.NODE_ENV === "development";
    const isBatchMode = process.env.IS_DATA_UPDATER === "true";
    const extractContent = process.env.EXTRACT_BOOKMARK_CONTENT === "true" || isBatchMode;
    const enrichedBookmarks = await processBookmarksInBatches(bookmarksToProcess, isDev, isBatchMode, extractContent);

    console.log(`[refreshBookmarksData] OpenGraph enrichment completed for ${enrichedBookmarks.length} bookmarks.`);

    // Save raw JSON & update checksum pointer (best-effort)
    try {
      const rawDataKey = `${RAW_CACHE_PREFIX}/${rawChecksum}.json`;
      await writeJsonS3(rawDataKey, allRawBookmarks);
      await writeJsonS3(latestKey, { checksum: rawChecksum, key: rawDataKey });
      console.log(`[refreshBookmarksData] Raw bookmark snapshot saved (${rawChecksum}).`);
    } catch (err) {
      console.warn("[refreshBookmarksData] Failed to persist raw snapshot:", String(err));
    }

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
        // Return the S3 fallback data instead of throwing error
        return s3Backup;
      } else {
        console.warn(
          "[refreshBookmarksData] S3_FALLBACK_NODATA: S3 fallback attempted but no data was found or data was empty.",
        );
      }
    } catch (s3ReadError) {
      console.error("[refreshBookmarksData] S3_FALLBACK_FAILURE: Error reading fallback S3 data:", s3ReadError);
    }

    // If we can't get S3 fallback data, return empty array instead of throwing
    console.warn("[refreshBookmarksData] All fallback attempts failed. Returning empty array to prevent hard failure.");
    return [];
  }
}
