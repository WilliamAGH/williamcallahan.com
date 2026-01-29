/**
 * @file Helper functions for bookmark refresh operations.
 *
 * Extracted from bookmarks.ts to maintain single-responsibility and
 * comply with the 350-line limit. These functions handle the individual
 * stages of the bookmark refresh pipeline.
 *
 * @module lib/bookmarks/refresh-helpers
 */

import { BOOKMARKS_S3_PATHS, BOOKMARKS_API_CONFIG } from "@/lib/constants";
import { readJsonS3, writeJsonS3 } from "@/lib/s3-utils";
import { normalizeBookmarks } from "./normalize";
import { processBookmarksInBatches } from "./enrich-opengraph";
import { createHash } from "node:crypto";

import {
  type UnifiedBookmark,
  type RawApiBookmark,
  type BookmarksApiResponse as ApiResponse,
  type BookmarksApiContext,
  type ChecksumResult,
  bookmarksApiResponseSchema,
} from "@/types/bookmark";

// Re-export types for backward compatibility
export type { BookmarksApiContext, ChecksumResult };

// S3 prefix for raw API snapshots (environment-suffixed for isolation)
const RAW_CACHE_PREFIX = "json/bookmarks/raw";

/** Validates required environment configuration and returns API context */
export function validateApiConfig(): BookmarksApiContext {
  const bookmarksListId = BOOKMARKS_API_CONFIG.LIST_ID;
  if (!bookmarksListId) {
    console.error(
      "[refreshBookmarksData] CRITICAL_CONFIG: BOOKMARKS_LIST_ID environment variable is not set.",
    );
    throw new Error("CRITICAL_CONFIG: BOOKMARKS_LIST_ID environment variable is not set.");
  }

  const bearerToken = BOOKMARKS_API_CONFIG.BEARER_TOKEN;
  if (!bearerToken) {
    console.error(
      "[refreshBookmarksData] CRITICAL_CONFIG: BOOKMARK_BEARER_TOKEN environment variable is not set.",
    );
    throw new Error("CRITICAL_CONFIG: BOOKMARK_BEARER_TOKEN environment variable is not set.");
  }

  return {
    apiUrl: `${BOOKMARKS_API_CONFIG.API_URL}/lists/${bookmarksListId}/bookmarks`,
    requestHeaders: {
      Accept: "application/json",
      Authorization: `Bearer ${bearerToken}`,
    },
  };
}

/** Handles test environment by returning S3 data or empty array */
export async function handleTestEnvironment(): Promise<UnifiedBookmark[] | null> {
  if (process.env.NODE_ENV !== "test") return null;

  try {
    const s3Backup = await readJsonS3<UnifiedBookmark[]>(BOOKMARKS_S3_PATHS.FILE);
    if (Array.isArray(s3Backup) && s3Backup.length > 0) {
      console.log("[refreshBookmarksData] Test mode: returning bookmarks from S3 persistence");
      return s3Backup;
    }
  } catch {
    console.warn("[refreshBookmarksData] Test mode S3 read failed, proceeding with empty dataset");
  }
  console.log("[refreshBookmarksData] Test mode: no S3 data, returning empty dataset");
  return [];
}

/** Fetches all pages from the bookmarks API with pagination */
export async function fetchAllPagesFromApi(ctx: BookmarksApiContext): Promise<RawApiBookmark[]> {
  console.log(`[refreshBookmarksData] Fetching all bookmarks from API: ${ctx.apiUrl}`);
  const allRawBookmarks: RawApiBookmark[] = [];
  let cursor: string | null = null;
  let pageCount = 0;

  do {
    pageCount++;
    const pageUrl = cursor ? `${ctx.apiUrl}?cursor=${encodeURIComponent(cursor)}` : ctx.apiUrl;
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
        headers: ctx.requestHeaders,
        signal: pageController.signal,
        redirect: "follow",
      });
    } finally {
      clearTimeout(pageTimeoutId);
    }

    if (!pageResponse.ok) {
      const responseText = await pageResponse.text();
      throw new Error(
        `API request to ${pageUrl} failed with status ${pageResponse.status}: ${responseText}`,
      );
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
    console.log(
      `[refreshBookmarksData] Retrieved ${data.bookmarks.length} bookmarks from page ${pageCount}.`,
    );
    allRawBookmarks.push(...data.bookmarks);
    cursor = data.nextCursor;
  } while (cursor);

  console.log(
    `[refreshBookmarksData] Total raw bookmarks fetched across ${pageCount} pages: ${allRawBookmarks.length}`,
  );
  return allRawBookmarks;
}

/** Validates checksum and returns cached data if unchanged, or null to proceed */
export async function validateChecksumAndGetCached(
  allRawBookmarks: RawApiBookmark[],
  force: boolean,
): Promise<ChecksumResult> {
  const rawJsonString = JSON.stringify(allRawBookmarks);
  const rawChecksum = createHash("sha256").update(rawJsonString).digest("hex");
  const { ENVIRONMENT_SUFFIX } = await import("@/lib/config/environment");
  const latestKey = `${RAW_CACHE_PREFIX}${ENVIRONMENT_SUFFIX}/LATEST.json`;

  if (force) {
    console.log("[refreshBookmarksData] Force refresh requested, skipping checksum check.");
    return { cached: null, checksum: rawChecksum, latestKey, envSuffix: ENVIRONMENT_SUFFIX };
  }

  try {
    const latest = await readJsonS3<{ checksum: string; key: string }>(latestKey);
    if (latest?.checksum === rawChecksum) {
      const cached = await readJsonS3<UnifiedBookmark[]>(BOOKMARKS_S3_PATHS.FILE);

      if (cached && cached.length === allRawBookmarks.length) {
        const hasSlugs = cached.every((b) => {
          if (typeof b !== "object" || b === null || !("slug" in b)) return false;
          const s = (b as Record<string, unknown>).slug;
          return typeof s === "string" && s.length > 0;
        });
        if (hasSlugs) {
          console.log(
            `[refreshBookmarksData] Raw checksum unchanged (${rawChecksum}) – reuse cached.`,
          );
          return { cached, checksum: rawChecksum, latestKey, envSuffix: ENVIRONMENT_SUFFIX };
        }
        console.warn("[refreshBookmarksData] Cached manifest lacks slugs; regenerating.");
      } else {
        console.warn(
          `[refreshBookmarksData] Manifest size mismatch (cached: ${cached?.length ?? 0}, expected: ${allRawBookmarks.length}).`,
        );
      }
    }
  } catch (err) {
    console.warn("[refreshBookmarksData] Could not read raw LATEST checksum:", String(err));
  }

  return { cached: null, checksum: rawChecksum, latestKey, envSuffix: ENVIRONMENT_SUFFIX };
}

/** Normalizes bookmarks and embeds slugs into each bookmark object */
export async function normalizeAndGenerateSlugs(
  rawBookmarks: RawApiBookmark[],
): Promise<UnifiedBookmark[]> {
  const normalizedBookmarks = normalizeBookmarks(rawBookmarks);
  console.log(
    `[refreshBookmarksData] Successfully normalized ${normalizedBookmarks.length} bookmarks.`,
  );

  const { generateSlugMapping, saveSlugMapping } = await import("@/lib/bookmarks/slug-manager");
  const slugMapping = generateSlugMapping(normalizedBookmarks);

  for (const bookmark of normalizedBookmarks) {
    const slugEntry = slugMapping.slugs[bookmark.id];
    if (!slugEntry) {
      throw new Error(`[refreshBookmarksData] Missing slug mapping for bookmark id=${bookmark.id}`);
    }
    bookmark.slug = slugEntry.slug;
  }
  console.log(
    `[refreshBookmarksData] Generated slugs for ${normalizedBookmarks.length} bookmarks.`,
  );

  try {
    await saveSlugMapping(normalizedBookmarks);
    console.log(`[refreshBookmarksData] Persisted slug mapping to S3.`);
  } catch (err) {
    console.warn("[refreshBookmarksData] Failed to persist slug mapping (non-fatal):", String(err));
  }

  return normalizedBookmarks;
}

/** Applies optional test limit and enriches bookmarks with OpenGraph data */
export async function enrichWithOpenGraph(
  normalizedBookmarks: UnifiedBookmark[],
): Promise<UnifiedBookmark[]> {
  // Apply test limit if configured
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
      `[refreshBookmarksData] Dev mode limit: processing ${bookmarksToProcess.length} of ${normalizedBookmarks.length}.`,
    );
  }

  console.log(
    `[refreshBookmarksData] Starting OpenGraph enrichment for ${bookmarksToProcess.length} bookmarks...`,
  );

  const isDev = process.env.NODE_ENV === "development";
  const isBatchMode = process.env.IS_DATA_UPDATER === "true";
  const extractContent = process.env.EXTRACT_BOOKMARK_CONTENT === "true" || isBatchMode;

  const metadataOnlyMode = process.env.BOOKMARK_METADATA_ONLY_REFRESH === "true";
  const refreshOptions = metadataOnlyMode
    ? {
        metadataOnly: true,
        refreshMetadataEvenIfImagePresent: true,
        maxItems: parseInt(process.env.BOOKMARK_METADATA_REFRESH_LIMIT || "50", 10),
      }
    : undefined;

  if (metadataOnlyMode) {
    console.log(
      `[refreshBookmarksData] Metadata-only refresh mode (limit: ${refreshOptions?.maxItems || 50})`,
    );
  }

  const enrichedBookmarks = await processBookmarksInBatches(
    bookmarksToProcess,
    isDev,
    isBatchMode,
    extractContent,
    refreshOptions,
  );

  console.log(
    `[refreshBookmarksData] OpenGraph enrichment completed for ${enrichedBookmarks.length} bookmarks.`,
  );
  return enrichedBookmarks;
}

/** Persists enriched bookmarks and raw snapshot to S3 */
export async function persistToS3(
  enrichedBookmarks: UnifiedBookmark[],
  allRawBookmarks: RawApiBookmark[],
  checksum: string,
  latestKey: string,
  envSuffix: string,
): Promise<void> {
  await writeJsonS3(BOOKMARKS_S3_PATHS.FILE, enrichedBookmarks);
  console.log(
    `[refreshBookmarksData] Persisted enriched manifest to ${BOOKMARKS_S3_PATHS.FILE} (${enrichedBookmarks.length} records).`,
  );

  try {
    const rawDataKey = `${RAW_CACHE_PREFIX}${envSuffix}/${checksum}.json`;
    await writeJsonS3(rawDataKey, allRawBookmarks);
    await writeJsonS3(latestKey, { checksum, key: rawDataKey });
    console.log(`[refreshBookmarksData] Raw snapshot saved to S3 (checksum: ${checksum}).`);
  } catch (err) {
    console.warn(
      "[refreshBookmarksData] Failed to persist raw snapshot (non-critical):",
      String(err),
    );
  }
}

/** Attempts to load S3 fallback data when primary fetch fails */
export async function loadS3Fallback(): Promise<UnifiedBookmark[] | null> {
  try {
    console.log("[refreshBookmarksData] API failed, loading from S3 (primary storage)...");
    const s3Backup = await readJsonS3<UnifiedBookmark[]>(BOOKMARKS_S3_PATHS.FILE);
    if (Array.isArray(s3Backup) && s3Backup.length > 0) {
      console.log(
        `[refreshBookmarksData] S3_FALLBACK_SUCCESS: Returning ${s3Backup.length} bookmarks.`,
      );
      return s3Backup;
    }
    console.warn("[refreshBookmarksData] S3_FALLBACK_EMPTY: S3 storage contains no bookmarks.");
  } catch (s3ReadError) {
    console.error("[refreshBookmarksData] S3_FALLBACK_FAILURE:", s3ReadError);
  }
  return null;
}
