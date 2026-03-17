/**
 * @file Helper functions for bookmark refresh operations.
 *
 * These functions handle fetch, checksum gating, normalization,
 * enrichment, and PostgreSQL fallback loading.
 *
 * @module lib/bookmarks/refresh-helpers
 */

import { BOOKMARKS_API_CONFIG } from "@/lib/constants";
import { normalizeBookmarks } from "./normalize";
import { processBookmarksInBatches } from "./enrich-opengraph";
import { createHash } from "node:crypto";

import {
  type UnifiedBookmark,
  type RawApiBookmark,
  type BookmarksApiResponse as ApiResponse,
  bookmarksApiResponseSchema,
} from "@/types/schemas/bookmark";
import type { BookmarksApiContext, ChecksumResult } from "@/types/bookmark";

// Re-export types for backward compatibility
export type { BookmarksApiContext, ChecksumResult };

let bookmarkQueryModulePromise: Promise<typeof import("@/lib/db/queries/bookmarks")> | null = null;

const loadBookmarkQueryModule = async (): Promise<typeof import("@/lib/db/queries/bookmarks")> => {
  bookmarkQueryModulePromise ??= import("@/lib/db/queries/bookmarks");
  return bookmarkQueryModulePromise;
};

/** Validates required environment configuration and returns API context. */
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

/** Handles test environment by returning PostgreSQL data or an empty array. */
export async function handleTestEnvironment(): Promise<UnifiedBookmark[] | null> {
  if (process.env.NODE_ENV !== "test") return null;

  try {
    const { getAllBookmarks } = await loadBookmarkQueryModule();
    const existingBookmarks = await getAllBookmarks();
    if (existingBookmarks.length > 0) {
      console.log(
        "[refreshBookmarksData] Test mode: returning bookmarks from PostgreSQL persistence",
      );
      return existingBookmarks;
    }
  } catch (error) {
    console.warn(
      "[refreshBookmarksData] Test mode: PostgreSQL read unavailable, returning empty dataset:",
      String(error),
    );
  }

  console.log("[refreshBookmarksData] Test mode: no PostgreSQL data, returning empty dataset");
  return [];
}

/** Fetches all pages from the bookmarks API with pagination. */
export async function fetchAllPagesFromApi(ctx: BookmarksApiContext): Promise<RawApiBookmark[]> {
  console.log(`[refreshBookmarksData] Fetching all bookmarks from API: ${ctx.apiUrl}`);
  const allRawBookmarks: RawApiBookmark[] = [];
  let cursor: string | null = null;
  let pageCount = 0;

  do {
    pageCount += 1;
    const pageUrl = cursor
      ? `${ctx.apiUrl}?cursor=${encodeURIComponent(cursor)}&includeContent=true`
      : `${ctx.apiUrl}?includeContent=true`;
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
        parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
      );
      throw new Error("Invalid bookmarks API response shape");
    }

    const apiResponse: ApiResponse = parsed.data;
    console.log(
      `[refreshBookmarksData] Retrieved ${apiResponse.bookmarks.length} bookmarks from page ${pageCount}.`,
    );
    allRawBookmarks.push(...apiResponse.bookmarks);
    cursor = apiResponse.nextCursor;
  } while (cursor);

  console.log(
    `[refreshBookmarksData] Total raw bookmarks fetched across ${pageCount} pages: ${allRawBookmarks.length}`,
  );
  return allRawBookmarks;
}

/**
 * Validates checksum and returns cached PostgreSQL data if unchanged,
 * or null to continue with full normalization/enrichment.
 */
export async function validateChecksumAndGetCached(
  allRawBookmarks: RawApiBookmark[],
  force: boolean,
): Promise<ChecksumResult> {
  const rawJsonString = JSON.stringify(allRawBookmarks);
  const rawChecksum = createHash("sha256").update(rawJsonString).digest("hex");

  if (force) {
    console.log("[refreshBookmarksData] Force refresh requested, skipping checksum check.");
    return { cached: null, checksum: rawChecksum };
  }

  try {
    const { getAllBookmarks, getBookmarksIndexFromDatabase } = await loadBookmarkQueryModule();
    const indexState = await getBookmarksIndexFromDatabase();

    if (indexState.checksum !== rawChecksum) {
      return { cached: null, checksum: rawChecksum };
    }

    const cachedBookmarks = await getAllBookmarks();
    if (cachedBookmarks.length !== allRawBookmarks.length) {
      console.warn(
        `[refreshBookmarksData] PostgreSQL count mismatch (cached: ${cachedBookmarks.length}, expected: ${allRawBookmarks.length}).`,
      );
      return { cached: null, checksum: rawChecksum };
    }

    const hasSlugs = cachedBookmarks.every(
      (bookmark) => typeof bookmark.slug === "string" && bookmark.slug.length > 0,
    );
    if (!hasSlugs) {
      console.warn("[refreshBookmarksData] PostgreSQL cache lacks slugs; regenerating dataset.");
      return { cached: null, checksum: rawChecksum };
    }

    console.log(`[refreshBookmarksData] Raw checksum unchanged (${rawChecksum}) - reuse cached.`);
    return { cached: cachedBookmarks, checksum: rawChecksum };
  } catch (error) {
    console.warn(
      "[refreshBookmarksData] Could not read PostgreSQL cache during checksum validation:",
      String(error),
    );
    return { cached: null, checksum: rawChecksum };
  }
}

/** Normalizes bookmarks and embeds slugs into each bookmark object. */
export async function normalizeAndGenerateSlugs(
  rawBookmarks: RawApiBookmark[],
): Promise<UnifiedBookmark[]> {
  const normalizedBookmarks = normalizeBookmarks(rawBookmarks);
  console.log(
    `[refreshBookmarksData] Successfully normalized ${normalizedBookmarks.length} bookmarks.`,
  );

  const { generateSlugMapping } = await import("@/lib/bookmarks/slug-manager");
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
  return normalizedBookmarks;
}

/** Applies optional test limit and enriches bookmarks with OpenGraph data. */
export async function enrichWithOpenGraph(
  normalizedBookmarks: UnifiedBookmark[],
): Promise<UnifiedBookmark[]> {
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
    refreshOptions,
  );

  console.log(
    `[refreshBookmarksData] OpenGraph enrichment completed for ${enrichedBookmarks.length} bookmarks.`,
  );
  return enrichedBookmarks;
}

/** Attempts to load PostgreSQL fallback data when primary fetch fails. */
export async function loadDatabaseFallback(): Promise<UnifiedBookmark[] | null> {
  try {
    console.log("[refreshBookmarksData] API failed, loading from PostgreSQL fallback...");
    const { getAllBookmarks } = await loadBookmarkQueryModule();
    const existingBookmarks = await getAllBookmarks();
    if (existingBookmarks.length > 0) {
      console.log(
        `[refreshBookmarksData] DATABASE_FALLBACK_SUCCESS: Returning ${existingBookmarks.length} bookmarks.`,
      );
      return existingBookmarks;
    }
    console.warn(
      "[refreshBookmarksData] DATABASE_FALLBACK_EMPTY: PostgreSQL contains no bookmarks.",
    );
  } catch (error) {
    console.error("[refreshBookmarksData] DATABASE_FALLBACK_FAILURE:", error);
  }
  return null;
}
