/**
 * @file Bookmarks API and data refresh pipeline.
 *
 * Architecture:
 * - PostgreSQL = Primary source of truth
 * - Docker containers = Ephemeral (destroyed/recreated frequently)
 *
 * This module fetches bookmarks from Hoarder/Karakeep API, normalizes data,
 * enriches with OpenGraph metadata, and returns a dataset for refresh-logic
 * persistence orchestration. Handles pagination, error fallbacks, and
 * incremental updates via checksum comparison.
 *
 * @module lib/bookmarks
 */

import type { UnifiedBookmark } from "@/types/schemas/bookmark";

import {
  validateApiConfig,
  handleTestEnvironment,
  fetchAllPagesFromApi,
  validateChecksumAndGetCached,
  normalizeAndGenerateSlugs,
  enrichWithOpenGraph,
  loadDatabaseFallback,
} from "./refresh-helpers";

/**
 * Refreshes bookmarks data before persistence orchestration.
 *
 * Pipeline:
 * 1. Fetch all pages from external API (with timeout protection)
 * 2. Check if raw data changed via checksum (skip if unchanged)
 * 3. Normalize bookmarks and generate stable slugs
 * 4. Enrich with OpenGraph metadata (batched for memory efficiency)
 *
 * @param force - Skip checksum optimization and force full refresh
 * @returns Enriched bookmarks with embedded slugs
 * @throws If critical steps fail and PostgreSQL fallback is unavailable
 */
export async function refreshBookmarksData(force = false): Promise<UnifiedBookmark[]> {
  console.log(
    `[refreshBookmarksData] Starting refresh cycle from external API... (force: ${force})`,
  );

  try {
    // Test environment short-circuit
    const testResult = await handleTestEnvironment();
    if (testResult !== null) return testResult;

    // Validate configuration
    const ctx = validateApiConfig();

    // Fetch all pages from API
    const allRawBookmarks = await fetchAllPagesFromApi(ctx);

    // Check if data unchanged via checksum
    const checksumResult = await validateChecksumAndGetCached(allRawBookmarks, force);
    if (checksumResult.cached) return checksumResult.cached;

    // Normalize and generate slugs
    const normalizedBookmarks = await normalizeAndGenerateSlugs(allRawBookmarks);

    // Enrich with OpenGraph data
    const enrichedBookmarks = await enrichWithOpenGraph(normalizedBookmarks);

    console.log("[refreshBookmarksData] Refresh cycle completed successfully.");
    return enrichedBookmarks;
  } catch (error) {
    const fetchError = error instanceof Error ? error : new Error(String(error));
    console.error(`[refreshBookmarksData] PRIMARY_FETCH_FAILURE: ${fetchError.message}`);

    // Attempt PostgreSQL fallback
    const fallbackData = await loadDatabaseFallback();
    if (fallbackData) return fallbackData;

    console.error("[refreshBookmarksData] All fallback attempts failed.");
    throw fetchError;
  }
}
