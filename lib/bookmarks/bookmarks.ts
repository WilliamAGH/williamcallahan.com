/**
 * @file Bookmarks API and data management with S3-first persistence.
 * 
 * Architecture:
 * - S3 = Primary source of truth (persistent across deployments)
 * - Docker containers = Ephemeral (destroyed/recreated frequently)
 * - Local files = Temporary cache/fallback only (not critical for persistence)
 * 
 * This module fetches bookmarks from Hoarder/Karakeep API, normalizes data,
 * enriches with OpenGraph metadata, and persists to S3. Handles pagination,
 * error fallbacks, and incremental updates via checksum comparison.
 * 
 * @module lib/bookmarks
 */

import { BOOKMARKS_S3_PATHS, BOOKMARKS_API_CONFIG } from "@/lib/constants";
import { readJsonS3 } from "@/lib/s3-utils";
import { normalizeBookmarks } from "./normalize";
import { processBookmarksInBatches } from "./enrich-opengraph";
import { createHash } from "node:crypto";
import { writeJsonS3 } from "@/lib/s3-utils";

import type { UnifiedBookmark, RawApiBookmark, BookmarksApiResponse as ApiResponse } from "@/types/bookmark";
import { bookmarksApiResponseSchema } from "@/types/bookmark";

// S3 prefix for raw API snapshots (environment-suffixed for isolation)
// These snapshots enable incremental refresh by comparing checksums
const RAW_CACHE_PREFIX = "json/bookmarks/raw";

/**
 * @deprecated Use getBookmarks from service.server.ts instead
 * This function is kept for backward compatibility during migration
 */
export { getBookmarks as fetchExternalBookmarks } from "./service.server";

/**
 * Refreshes bookmarks data with S3-first persistence strategy.
 * 
 * Pipeline:
 * 1. Fetch all pages from external API (with timeout protection)
 * 2. Check if raw data changed via checksum (skip if unchanged)
 * 3. Normalize bookmarks and generate stable slugs
 * 4. Enrich with OpenGraph metadata (batched for memory efficiency)
 * 5. Persist enriched manifest to S3 (primary storage)
 * 6. Update raw snapshot and checksum pointer in S3
 *
 * @param {boolean} force - Skip checksum optimization and force full refresh
 * @returns {Promise<UnifiedBookmark[]>} Enriched bookmarks with embedded slugs
 * @throws {Error} If critical steps fail and S3 fallback is unavailable.
 *                 Returns S3 fallback on primary failures when available.
 */
export async function refreshBookmarksData(force = false): Promise<UnifiedBookmark[]> {
  console.log(`[refreshBookmarksData] Starting refresh cycle from external API... (force: ${force})`);

  // Read configuration from constants
  const bookmarksListId = BOOKMARKS_API_CONFIG.LIST_ID;
  if (!bookmarksListId) {
    console.error("[refreshBookmarksData] CRITICAL_CONFIG: BOOKMARKS_LIST_ID environment variable is not set.");
    console.warn(
      "[refreshBookmarksData] Throwing error due to missing BOOKMARKS_LIST_ID. Check deployment environment variables.",
    );
    throw new Error("CRITICAL_CONFIG: BOOKMARKS_LIST_ID environment variable is not set.");
  }
  const apiUrl = `${BOOKMARKS_API_CONFIG.API_URL}/lists/${bookmarksListId}/bookmarks`;

  const bearerToken = BOOKMARKS_API_CONFIG.BEARER_TOKEN;
  if (!bearerToken) {
    console.error("[refreshBookmarksData] CRITICAL_CONFIG: BOOKMARK_BEARER_TOKEN environment variable is not set.");
    console.warn(
      "[refreshBookmarksData] Throwing error due to missing BOOKMARK_BEARER_TOKEN. Check deployment environment variables.",
    );
    throw new Error("CRITICAL_CONFIG: BOOKMARK_BEARER_TOKEN environment variable is not set.");
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

      const raw = (await pageResponse.json()) as unknown;
      const parsed = bookmarksApiResponseSchema.safeParse(raw);
      if (!parsed.success) {
        console.error(
          "[refreshBookmarksData] Invalid API response shape:",
          parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        );
        throw new Error("Invalid bookmarks API response shape");
      }
      const data: ApiResponse = parsed.data;
      console.log(`[refreshBookmarksData] Retrieved ${data.bookmarks.length} bookmarks from page ${pageCount}.`);
      allRawBookmarks.push(...data.bookmarks);
      cursor = data.nextCursor;
    } while (cursor);

    console.log(
      `[refreshBookmarksData] Total raw bookmarks fetched across ${pageCount} pages: ${allRawBookmarks.length}`,
    );

    // -------------------------------------------------------------
    // Optimization: Skip processing if raw data unchanged (via checksum)
    // -------------------------------------------------------------
    const rawJsonString = JSON.stringify(allRawBookmarks);
    const rawChecksum = createHash("sha256").update(rawJsonString).digest("hex");
    // Environment-aware raw snapshot pointer
    const { ENVIRONMENT_SUFFIX } = await import("@/lib/config/environment");
    const latestKey = `${RAW_CACHE_PREFIX}${ENVIRONMENT_SUFFIX}/LATEST.json`;

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
            // Back-compat runtime check: some historic persisted manifests may predate slug embedding.
            // Use a runtime guard to ensure we only reuse a cached manifest that already contains slugs.
            const hasSlugs = cached.every((b) => {
              if (typeof b !== "object" || b === null || !("slug" in b)) return false;
              const s = (b as Record<string, unknown>).slug;
              return typeof s === "string" && s.length > 0;
            });
            if (hasSlugs) {
              console.log(
                `[refreshBookmarksData] Raw checksum unchanged (${rawChecksum}) and manifest already contains ${cached.length} records with slugs – reuse without re-processing.`,
              );
              return cached;
            }
            console.warn(
              "[refreshBookmarksData] Raw checksum unchanged but cached manifest lacks slugs; proceeding with normalization & slug generation.",
            );
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

    // Generate slugs immediately after normalization for idempotent routing
    const { generateSlugMapping, saveSlugMapping } = await import("@/lib/bookmarks/slug-manager");
    const slugMapping = generateSlugMapping(normalizedBookmarks);

    // Embed slugs directly into bookmark objects
    // Note: generateSlugMapping guarantees every bookmark has a slug or throws
    for (const bookmark of normalizedBookmarks) {
      const slugEntry = slugMapping.slugs[bookmark.id];
      if (!slugEntry) {
        // This should never happen since generateSlugMapping throws on missing slugs
        throw new Error(`[refreshBookmarksData] Missing slug mapping for bookmark id=${bookmark.id}`);
      }
      bookmark.slug = slugEntry.slug;
    }
    console.log(`[refreshBookmarksData] Generated slugs for ${normalizedBookmarks.length} bookmarks.`);

    // Persist slug mapping to S3 (primary) and local file (ephemeral cache)
    // S3 persistence ensures stable routes across container restarts/deployments
    try {
      await saveSlugMapping(normalizedBookmarks);
      console.log(
        `[refreshBookmarksData] Persisted slug mapping to S3 (primary) and local cache for ${normalizedBookmarks.length} bookmarks.`,
      );
    } catch (err) {
      // Non-fatal: slugs are embedded in objects, but S3 persistence ensures consistency
      console.warn("[refreshBookmarksData] Failed to persist slug mapping to S3 (non-fatal):", String(err));
    }

    // -------------------------------------------------------------------------
    // Explicit test limit (S3_TEST_LIMIT env var)
    // -------------------------------------------------------------------------
    // WARNING: This limit affects S3 persistence! Use only for testing.
    // Previously, implicit dev limits leaked to production S3 data.
    // Now requires explicit S3_TEST_LIMIT env var to prevent accidents.
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

    // Persist the canonical enriched manifest (critical for downstream consumers and reuse path)
    try {
      await writeJsonS3(BOOKMARKS_S3_PATHS.FILE, enrichedBookmarks);
      console.log(
        `[refreshBookmarksData] Persisted enriched manifest to ${BOOKMARKS_S3_PATHS.FILE} (${enrichedBookmarks.length} records).`,
      );
    } catch (err) {
      console.error("[refreshBookmarksData] CRITICAL: Failed to persist enriched manifest to S3:", err);
      // Bubble up to allow outer catch to attempt S3 fallback and surface failure appropriately
      throw err;
    }

    // Save raw snapshot & checksum pointer for incremental refresh optimization
    // These S3 artifacts enable skipping unchanged data on next refresh
    try {
      const rawDataKey = `${RAW_CACHE_PREFIX}${ENVIRONMENT_SUFFIX}/${rawChecksum}.json`;
      await writeJsonS3(rawDataKey, allRawBookmarks);
      await writeJsonS3(latestKey, { checksum: rawChecksum, key: rawDataKey });
      console.log(`[refreshBookmarksData] Raw snapshot saved to S3 (checksum: ${rawChecksum}).`);
    } catch (err) {
      // Non-critical: only affects next refresh optimization
      console.warn("[refreshBookmarksData] Failed to persist raw snapshot to S3:", String(err));
    }

    console.log("[refreshBookmarksData] Refresh cycle completed successfully.");
    return enrichedBookmarks;
  } catch (error) {
    primaryFetchError = error instanceof Error ? error : new Error(String(error));
    console.error(
      `[refreshBookmarksData] PRIMARY_FETCH_FAILURE: Error during external API fetch or processing: ${primaryFetchError.message}`,
      primaryFetchError,
    );

    // Resilience: Return cached S3 data when API fails (S3 = source of truth)
    try {
      console.log("[refreshBookmarksData] API failed, loading from S3 (primary storage)...");
      const s3Backup = await readJsonS3<UnifiedBookmark[]>(BOOKMARKS_S3_PATHS.FILE);
      if (Array.isArray(s3Backup) && s3Backup.length > 0) {
        console.log(
          `[refreshBookmarksData] S3_FALLBACK_SUCCESS: Returning ${s3Backup.length} bookmarks from S3 storage.`,
        );
        // S3 is our source of truth - return cached data for resilience
        return s3Backup;
      } else {
        console.warn(
          "[refreshBookmarksData] S3_FALLBACK_EMPTY: S3 storage exists but contains no bookmarks.",
        );
      }
    } catch (s3ReadError) {
      console.error("[refreshBookmarksData] S3_FALLBACK_FAILURE: Cannot read from S3 storage:", s3ReadError);
    }

    // If we can't get S3 fallback data, throw the original error
    console.error("[refreshBookmarksData] All fallback attempts failed. Throwing the original fetch error.");
    throw primaryFetchError;
  }
}
