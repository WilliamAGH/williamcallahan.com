/**
 * @file Bookmarks API and data management.
 * This module is responsible for fetching bookmarks from an external API (Hoarder/Karakeep),
 * normalizing the data, caching it (in-memory and S3), and providing functions
 * to access this data. It handles pagination, error fallbacks, and background refreshing.
 * @module lib/bookmarks
 */

import { OPENGRAPH_FETCH_CONFIG, BOOKMARKS_S3_PATHS } from "@/lib/constants";
import { getOpenGraphData } from "@/lib/data-access/opengraph";
import { readJsonS3 } from "@/lib/s3-utils";
import { createKarakeepFallback, selectBestImage } from "@/lib/utils/bookmark-helpers";

import type { BookmarkAsset, BookmarkContent, UnifiedBookmark } from "@/types";

/**
 * Represents the raw structure of a tag object as received from the external bookmarks API.
 */
export interface RawApiBookmarkTag {
  /** Unique identifier for the tag. */
  id: string;
  /** Name of the tag. */
  name: string;
  /** Indicates who attached the tag (e.g., 'user', 'ai'). */
  attachedBy: string;
}

/**
 * Represents the raw structure of the content object within a bookmark, as received from the external API.
 * @internal
 */
interface RawApiBookmarkContent {
  /** Type of content, e.g., 'link', 'image'. */
  type: "link" | "image" | (string & {}); // Allows for other string types
  /** URL of the content. */
  url: string;
  title: string | null;
  description: string | null;
  imageUrl?: string;
  imageAssetId?: string;
  screenshotAssetId?: string;
  favicon?: string;
  htmlContent?: string;
  crawledAt?: string;
  author?: string | null;
  publisher?: string | null;
  datePublished?: string | null;
  dateModified?: string | null;
}

/**
 * Represents the raw structure of a bookmark object as received from the external API.
 */
export interface RawApiBookmark {
  /** Unique identifier for the bookmark. */
  id: string;
  /** ISO date string of when the bookmark was created. */
  createdAt: string;
  /** ISO date string of when the bookmark was last modified. */
  modifiedAt: string;
  /** Title of the bookmark (can also be in `content`). */
  title: string | null;
  /** Whether the bookmark is archived. */
  archived: boolean;
  /** Whether the bookmark is marked as a favorite. */
  favourited: boolean;
  /** Status of tagging (e.g., 'complete', 'in-progress'). */
  taggingStatus: "complete" | "in-progress" | (string & {});
  /** User's note for the bookmark. */
  note: string | null;
  /** Summary of the bookmark (can also be in `content`). */
  summary: string | null;
  /** Array of tags associated with the bookmark. */
  tags: RawApiBookmarkTag[];
  /** Detailed content of the bookmark. */
  content: RawApiBookmarkContent;
  /** Array of assets associated with the bookmark. */
  assets: BookmarkAsset[];
}

/**
 * Represents the structure of the paginated API response when fetching bookmarks.
 */
export interface ApiResponse {
  /** An array of raw bookmark objects for the current page. */
  bookmarks: RawApiBookmark[];
  /** A cursor string for fetching the next page of results, or null if no more pages. */
  nextCursor: string | null;
}

import { ServerCacheInstance } from "./server-cache";

/**
 * Utility function to remove the potentially large `htmlContent` field from a bookmark's content object.
 * This is used to reduce the size of data stored in some caches or passed around.
 *
 * @template T - A type extending RawApiBookmarkContent.
 * @param {T} content - The bookmark content object.
 * @returns {Omit<T, 'htmlContent'>} The content object without the `htmlContent` property.
 * @internal
 */
function omitHtmlContent<T extends RawApiBookmarkContent>(content: T): Omit<T, "htmlContent"> {
  // eslint-disable-next-line @typescript-eslint/naming-convention, @typescript-eslint/no-unused-vars
  const { htmlContent: _omit, ...rest } = content;
  return rest;
}

/**
 * Fetches bookmarks from the server cache or external API
 *
 * @returns {Promise<UnifiedBookmark[]>} A promise that resolves to an array of unified bookmarks.
 * @throws {Error} If the API request fails and no cached data is available.
 */

// Configuration: allow overriding API base URL and list ID via environment
// const BOOKMARKS_LIST_ID = process.env.BOOKMARKS_LIST_ID ?? 'xrfqu4awxsqkr1ch404qwd9i'; // Removed
// const BOOKMARKS_API_URL = process.env.BOOKMARKS_API_URL ?? 'https://bookmark.iocloudhost.net/api/v1'; // Removed

/**
 * Fetches bookmarks, prioritizing server cache (ServerCacheInstance).
 * If cached data is available and not stale, it's returned immediately.
 * If cached data is stale, it's returned while a background refresh is initiated.
 * If no cache is available, it fetches fresh data directly and waits for the result.
 *
 * @returns {Promise<UnifiedBookmark[]>} A promise that resolves to an array of unified bookmarks.
 * @throws {Error} Only if fetching fresh data is required (no cache) and that fetch fails.
 *                 Background refresh errors are logged but do not cause this function to throw.
 */
export async function fetchExternalBookmarks(): Promise<UnifiedBookmark[]> {
  // Check cache first
  const cachedData = ServerCacheInstance.getBookmarks();

  // If we have cached data and it doesn't need refreshing, return it immediately
  if (cachedData && !ServerCacheInstance.shouldRefreshBookmarks()) {
    console.log("Using cached bookmarks data");

    // Double-check the cached data is valid
    if (Array.isArray(cachedData.bookmarks) && cachedData.bookmarks.length > 0) {
      // Return a copy to avoid mutation by background refresh
      return [...cachedData.bookmarks];
    }
  }

  // Check for cached fallback
  const hasCachedFallback = !!cachedData?.bookmarks?.length;

  // Start a background refresh if we have cached data
  if (hasCachedFallback) {
    console.log("Using cached bookmarks while refreshing in background");
    // Don't await this - run in background
    refreshBookmarksData().catch((error) => {
      console.error("Background refresh of bookmarks failed:", error);
    });
    // Return a copy to avoid subsequent mutations
    return [...cachedData.bookmarks];
  }

  // No cached data, must fetch and wait
  try {
    console.log("fetchExternalBookmarks: No cache available, fetching fresh data");
    const freshBookmarks = await refreshBookmarksData();
    console.log(
      "fetchExternalBookmarks: Successfully fetched fresh bookmarks, count:",
      freshBookmarks.length,
    );
    return freshBookmarks;
  } catch (error) {
    console.error("Failed to fetch bookmarks with no cache available:", error);
    // If we have no cached data and the fetch fails, return an empty array
    return [];
  }
}

/**
 * Processes bookmarks in batches to avoid overwhelming the network with concurrent OpenGraph requests
 * @param bookmarks - Array of bookmarks to process
 * @param isDev - Whether we're in development mode for enhanced logging
 * @returns Promise resolving to array of enriched bookmarks
 */
async function processBookmarksInBatches(
  bookmarks: UnifiedBookmark[],
  isDev: boolean,
): Promise<UnifiedBookmark[]> {
  const batchSize = OPENGRAPH_FETCH_CONFIG.MAX_CONCURRENT;
  const enrichedBookmarks: UnifiedBookmark[] = [];
  const startTime = Date.now();

  console.log(
    `[processBookmarksInBatches] Processing ${bookmarks.length} bookmarks in batches of ${batchSize}`,
  );
  if (isDev) {
    console.log("[processBookmarksInBatches] [DEV] Enhanced debugging enabled");
  }

  for (let i = 0; i < bookmarks.length; i += batchSize) {
    const batch = bookmarks.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(bookmarks.length / batchSize);

    console.log(
      `[processBookmarksInBatches] Processing batch ${batchNumber}/${totalBatches} (${batch.length} bookmarks)`,
    );
    const batchStartTime = Date.now();

    const batchResults = await Promise.all(
      batch.map(async (bookmark, batchIndex) => {
        const globalIndex = i + batchIndex;
        
        // Extract Karakeep image data for fallback with type safety - moved outside try block
        const karakeepFallback = createKarakeepFallback(
          bookmark.content,
          process.env.BOOKMARKS_API_URL || ''
        );
        
        try {
          if (!bookmark.url) {
            if (isDev)
              console.warn(
                `[processBookmarksInBatches] [DEV] Skipping bookmark ${bookmark.id} - no URL`,
              );
            return bookmark;
          }

          const ogStartTime = Date.now();
          if (isDev) {
            console.log(
              `[processBookmarksInBatches] [DEV] Fetching OpenGraph for ${bookmark.url} (${globalIndex + 1}/${bookmarks.length})`,
            );
          }

          const ogData = await getOpenGraphData(bookmark.url, false, bookmark.id, karakeepFallback);
          const ogDuration = Date.now() - ogStartTime;

          if (isDev) {
            console.log(
              `[processBookmarksInBatches] [DEV] OpenGraph fetch completed in ${ogDuration}ms for ${bookmark.url}`,
            );
          }

          if (ogData?.ogMetadata) {
            const enhancedBookmark: UnifiedBookmark = {
              ...bookmark,
              ogImage: bookmark.ogImage || ogData.imageUrl || ogData.ogMetadata.image || undefined,
              title:
                bookmark.title === "Untitled Bookmark"
                  ? ogData.ogMetadata.title || bookmark.title
                  : bookmark.title,
              description:
                bookmark.description === "No description available."
                  ? ogData.ogMetadata.description || bookmark.description
                  : bookmark.description,
              content: bookmark.content
                ? {
                    ...bookmark.content,
                    title:
                      bookmark.content.title === "Untitled Bookmark"
                        ? ogData.ogMetadata.title || bookmark.content.title
                        : bookmark.content.title,
                    description:
                      bookmark.content.description === "No description available."
                        ? ogData.ogMetadata.description || bookmark.content.description
                        : bookmark.content.description,
                    imageUrl:
                      bookmark.content.imageUrl ||
                      ogData.imageUrl ||
                      ogData.ogMetadata.image ||
                      undefined,
                  }
                : {
                    type: "link",
                    url: bookmark.url,
                    title: ogData.ogMetadata.title || bookmark.title,
                    description: ogData.ogMetadata.description || bookmark.description,
                    imageUrl: ogData.imageUrl || ogData.ogMetadata.image || undefined,
                  },
            };

            if (isDev) {
              console.log(
                `[processBookmarksInBatches] [DEV] Enhanced bookmark ${bookmark.id} with OpenGraph data`,
              );
            }
            return enhancedBookmark;
          }

          if (isDev) {
            console.warn(
              `[processBookmarksInBatches] [DEV] No OpenGraph data found for ${bookmark.url}`,
            );
          }
          
          // Use selectBestImage helper for consistent fallback logic
          const fallbackImage = selectBestImage(bookmark, { preferOpenGraph: false });
          if (fallbackImage) {
            const fallbackBookmark: UnifiedBookmark = {
              ...bookmark,
              ogImage: bookmark.ogImage || fallbackImage,
            };
            
            if (isDev) {
              console.log(
                `[processBookmarksInBatches] [DEV] Enhanced bookmark ${bookmark.id} with Karakeep fallback`,
              );
            }
            
            return fallbackBookmark;
          }
          
          return bookmark;
        } catch (ogError) {
          const errorMessage = ogError instanceof Error ? ogError.message : String(ogError);
          console.error(
            `[processBookmarksInBatches] OpenGraph fetch failed for bookmark ${bookmark.id} (${bookmark.url}):`,
            errorMessage,
          );
          if (isDev) {
            console.error("[processBookmarksInBatches] [DEV] Full error details:", ogError);
          }
          
          // Still use Karakeep fallback on error
          const errorFallbackImage = selectBestImage(bookmark, { preferOpenGraph: false });
          if (errorFallbackImage) {
            const fallbackBookmark: UnifiedBookmark = {
              ...bookmark,
              ogImage: bookmark.ogImage || errorFallbackImage,
            };
            
            if (isDev) {
              console.log(
                `[processBookmarksInBatches] [DEV] Using Karakeep fallback after error for ${bookmark.id}`,
              );
            }
            
            return fallbackBookmark;
          }
          
          return bookmark;
        }
      }),
    );

    enrichedBookmarks.push(...batchResults);
    const batchDuration = Date.now() - batchStartTime;
    console.log(
      `[processBookmarksInBatches] Batch ${batchNumber}/${totalBatches} completed in ${batchDuration}ms`,
    );

    // Add a delay between batches to be respectful to external services
    if (i + batchSize < bookmarks.length) {
      // Use randomized jitter to prevent thundering herd when multiple instances process simultaneously
      const { randomInt } = await import("node:crypto");
      const delayMs = randomInt(500, 2000); // Random 500-2000ms delay for multi-instance coordination
      if (isDev) {
        console.log(
          `[processBookmarksInBatches] [DEV] Waiting ${delayMs}ms (jittered) before next batch`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const totalDuration = Date.now() - startTime;
  console.log(
    `[processBookmarksInBatches] Completed processing ${enrichedBookmarks.length} bookmarks in ${totalDuration}ms`,
  );

  return enrichedBookmarks;
}

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

  // Read environment variables at call time
  const bookmarksListId = process.env.BOOKMARKS_LIST_ID;
  if (!bookmarksListId) {
    console.error(
      "[refreshBookmarksData] CRITICAL_CONFIG: BOOKMARKS_LIST_ID environment variable is not set.",
    );
    throw new Error("BOOKMARKS_LIST_ID environment variable must be set to your list ID");
  }
  const bookmarksApiUrl =
    process.env.BOOKMARKS_API_URL ?? "https://bookmark.iocloudhost.net/api/v1";
  const apiUrl = `${bookmarksApiUrl}/lists/${bookmarksListId}/bookmarks`;

  const bearerToken = process.env.BOOKMARK_BEARER_TOKEN;
  if (!bearerToken) {
    console.error(
      "[refreshBookmarksData] CRITICAL_CONFIG: BOOKMARK_BEARER_TOKEN environment variable is not set.",
    );
    throw new Error(
      "BOOKMARK_BEARER_TOKEN environment variable is not set. Cannot fetch bookmarks.",
    );
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
        console.warn(
          `[refreshBookmarksData] Aborting fetch for page ${pageUrl} due to 10s timeout.`,
        );
        pageController.abort();
      }, 10000); // 10 second timeout per page

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
    const normalizedBookmarks = allRawBookmarks
      .map((raw, index): UnifiedBookmark | null => {
        if (!raw || typeof raw !== "object") {
          console.warn(`[refreshBookmarksData] Invalid raw bookmark data at index ${index}:`, raw);
          return null;
        }
        try {
          const bestTitle = raw.title || raw.content?.title || "Untitled Bookmark";
          const bestDescription =
            raw.summary || raw.content?.description || "No description available.";
          const normalizedTags = Array.isArray(raw.tags)
            ? raw.tags.map((tag) => ({
                id: tag.id,
                name: tag.name,
                attachedBy: ((value): "user" | "ai" | undefined => {
                  return value === "user" ? "user" : value === "ai" ? "ai" : undefined;
                })(tag.attachedBy),
              }))
            : [];
          // Include asset IDs from raw.assets if raw.content fields are missing
          const screenshotAsset = raw.assets?.find((asset) => asset.assetType === "screenshot");
          const bannerAsset = raw.assets?.find((asset) => asset.assetType === "bannerImage");
          const unifiedContent: BookmarkContent = {
            ...(raw.content ? omitHtmlContent(raw.content) : {}),
            type: raw.content?.type ?? "link",
            url: raw.content?.url || "",
            title: bestTitle || "Untitled Bookmark",
            description: bestDescription || "No description available.",
            // Populate missing asset IDs for fallback rendering
            screenshotAssetId: raw.content?.screenshotAssetId ?? screenshotAsset?.id,
            imageAssetId: raw.content?.imageAssetId ?? bannerAsset?.id,
          };
          return {
            id: raw.id,
            url: raw.content?.url || "",
            title: bestTitle,
            description: bestDescription,
            tags: normalizedTags,
            ogImage: raw.content?.imageUrl, // Will be enhanced with OpenGraph data below
            dateBookmarked: raw.createdAt,
            datePublished: raw.content?.datePublished,
            createdAt: raw.createdAt,
            modifiedAt: raw.modifiedAt,
            archived: raw.archived,
            favourited: raw.favourited,
            taggingStatus: raw.taggingStatus,
            note: raw.note,
            summary: raw.summary,
            content: unifiedContent,
            assets: Array.isArray(raw.assets) ? raw.assets : [],
          };
        } catch (normError) {
          console.error(
            `[refreshBookmarksData] Error normalizing bookmark at index ${index} (ID: ${raw.id || "N/A"}):`,
            normError,
            raw,
          );
          return null;
        }
      })
      .filter((bookmark): bookmark is UnifiedBookmark => bookmark !== null);

    console.log(
      `[refreshBookmarksData] Successfully normalized ${normalizedBookmarks.length} bookmarks.`,
    );
    
    // Apply test limit if set
    let bookmarksToProcess = normalizedBookmarks;
    const testLimit = process.env.S3_TEST_LIMIT ? Number.parseInt(process.env.S3_TEST_LIMIT, 10) : 0;
    if (testLimit > 0) {
      bookmarksToProcess = normalizedBookmarks.slice(0, testLimit);
      console.log(
        `[refreshBookmarksData] Test mode active: limiting processing from ${normalizedBookmarks.length} to ${bookmarksToProcess.length} bookmark(s).`,
      );
    }
    
    console.log(
      `[refreshBookmarksData] Starting OpenGraph enrichment for ${bookmarksToProcess.length} bookmarks...`,
    );

    // Second pass: enrich with OpenGraph data using batched processing
    const isDev = process.env.NODE_ENV === "development";
    const enrichedBookmarks = await processBookmarksInBatches(bookmarksToProcess, isDev);

    console.log(
      `[refreshBookmarksData] OpenGraph enrichment completed for ${enrichedBookmarks.length} bookmarks.`,
    );

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
      console.log(
        "[refreshBookmarksData] Attempting to load fallback data from S3 due to primary fetch failure.",
      );
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
      console.error(
        "[refreshBookmarksData] S3_FALLBACK_FAILURE: Error reading fallback S3 data:",
        s3ReadError,
      );
    }

    // Always re-throw the primary fetch error so the cron job knows the refresh didn't complete as intended.
    throw primaryFetchError;
  }
}

// Initialize the refresh callback in data-access layer to avoid circular dependency
// This must be imported after the function is defined
import { setRefreshBookmarksCallback } from "@/lib/data-access/bookmarks";
setRefreshBookmarksCallback(refreshBookmarksData);
