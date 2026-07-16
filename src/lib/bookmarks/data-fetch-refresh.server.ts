/**
 * @file Produces bookmark refresh summaries for data-fetch runs.
 * @module lib/bookmarks/data-fetch-refresh
 */

import * as Sentry from "@sentry/nextjs";
import { getBookmarks } from "@/lib/bookmarks/bookmarks-data-access.server";
import { refreshBookmarks } from "@/lib/bookmarks/service.server";
import { getBookmarksIndexFromDatabase } from "@/lib/db/queries/bookmarks";
import { getMonotonicTime } from "@/lib/utils";
import logger from "@/lib/utils/logger";
import type { DataFetchOperationSummary } from "@/types/lib";

export async function runBookmarkRefresh(
  forceRefresh?: boolean,
): Promise<DataFetchOperationSummary> {
  const startTime = getMonotonicTime();
  logger.info("[DataFetchManager] Starting bookmarks fetch...");

  try {
    const previousBookmarks = await getBookmarks({ skipExternalFetch: true });
    const previousCount = previousBookmarks.length;

    const bookmarks = await refreshBookmarks(forceRefresh);
    if (!bookmarks) {
      throw new Error("No bookmarks returned from refresh");
    }
    if (bookmarks.length === 0) {
      throw new Error("Empty bookmarks array returned from refresh");
    }

    logger.info(
      `[DataFetchManager] Fetched ${bookmarks.length} bookmarks (previous: ${previousCount})`,
    );

    let changeDetected: boolean | undefined;
    let lastFetchedAt: number | undefined;
    try {
      const index = await getBookmarksIndexFromDatabase();
      changeDetected = index.changeDetected ?? undefined;
      lastFetchedAt = index.lastFetchedAt;
    } catch (error) {
      logger.warn("[DataFetchManager] Failed to read bookmarks index", { error });
    }

    return {
      success: true,
      operation: "bookmarks",
      itemsProcessed: bookmarks.length,
      duration: (getMonotonicTime() - startTime) / 1000,
      changeDetected,
      lastFetchedAt,
    };
  } catch (error: unknown) {
    const capturedError = error instanceof Error ? error : new Error(String(error));
    Sentry.captureException?.(capturedError);
    logger.error("[DataFetchManager] Bookmarks fetch failed:", capturedError);
    return {
      success: false,
      operation: "bookmarks",
      error: capturedError.message,
      duration: (getMonotonicTime() - startTime) / 1000,
    };
  }
}
