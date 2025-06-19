/**
 * OpenGraph Enrichment Module
 *
 * Handles fetching and enriching bookmarks with OpenGraph metadata
 *
 * @module lib/bookmarks/enrich-opengraph
 */

import { OPENGRAPH_FETCH_CONFIG, BOOKMARKS_API_CONFIG } from "@/lib/constants";
import { getOpenGraphData } from "@/lib/data-access/opengraph";
import { createKarakeepFallback, selectBestImage } from "./bookmark-helpers";
import type { UnifiedBookmark } from "@/types/bookmark";
import { ogMetadataSchema, type ValidatedOgMetadata } from "@/types/seo/opengraph";

/**
 * Processes bookmarks in batches to avoid overwhelming the network with concurrent OpenGraph requests
 *
 * @param bookmarks - Array of bookmarks to process
 * @param isDev - Whether we're in development mode for enhanced logging
 * @returns Promise resolving to array of enriched bookmarks
 */
export async function processBookmarksInBatches(
  bookmarks: UnifiedBookmark[],
  isDev: boolean,
): Promise<UnifiedBookmark[]> {
  const batchSize = OPENGRAPH_FETCH_CONFIG.MAX_CONCURRENT;
  const enrichedBookmarks: UnifiedBookmark[] = [];
  const startTime = Date.now();

  console.log(`[Bookmarks OpenGraph] Processing ${bookmarks.length} bookmarks in batches of ${batchSize}`);
  if (isDev) {
    console.log("[Bookmarks OpenGraph] [DEV] Enhanced debugging enabled");
  }

  for (let i = 0; i < bookmarks.length; i += batchSize) {
    const batch = bookmarks.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(bookmarks.length / batchSize);

    console.log(`[Bookmarks OpenGraph] Processing batch ${batchNumber}/${totalBatches} (${batch.length} bookmarks)`);
    const batchStartTime = Date.now();

    const batchResults = await Promise.all(
      batch.map(async (bookmark, batchIndex) => {
        const globalIndex = i + batchIndex;

        // Extract Karakeep image data for fallback with type safety
        const karakeepFallback = createKarakeepFallback(bookmark.content, BOOKMARKS_API_CONFIG.API_URL);

        try {
          if (!bookmark.url) {
            if (isDev) {
              console.warn(`[Bookmarks OpenGraph] [DEV] Skipping bookmark ${bookmark.id} - no URL`);
            }
            return bookmark;
          }

          const ogStartTime = Date.now();
          if (isDev) {
            console.log(
              `[Bookmarks OpenGraph] [DEV] Fetching OpenGraph for ${bookmark.url} (${globalIndex + 1}/${bookmarks.length})`,
            );
          }

          const ogData = await getOpenGraphData(bookmark.url, false, bookmark.id, karakeepFallback);
          const ogDuration = Date.now() - ogStartTime;

          if (isDev) {
            const statusMsg = ogData?.error ? ` (${ogData.error})` : "";
            console.log(
              `[Bookmarks OpenGraph] [DEV] OpenGraph fetch completed in ${ogDuration}ms for ${bookmark.url}${statusMsg}`,
            );
          }

          // Extract OG metadata if available
          if (ogData && !ogData.error) {
            try {
              const validatedOgMetadata: ValidatedOgMetadata | null = ogData?.ogMetadata
                ? ogMetadataSchema.safeParse(ogData.ogMetadata).success
                  ? ogMetadataSchema.parse(ogData.ogMetadata)
                  : null
                : null;

              if (validatedOgMetadata) {
                bookmark.title = validatedOgMetadata.title || bookmark.title;
                bookmark.description = validatedOgMetadata.description || bookmark.description;
                bookmark.ogImage = bookmark.ogImage || ogData.imageUrl || validatedOgMetadata.image || undefined;
                bookmark.content = bookmark.content
                  ? {
                      ...bookmark.content,
                      title:
                        bookmark.content.title === "Untitled Bookmark"
                          ? validatedOgMetadata.title || bookmark.content.title
                          : bookmark.content.title,
                      description:
                        bookmark.content.description === "No description available."
                          ? validatedOgMetadata.description || bookmark.content.description
                          : bookmark.content.description,
                      imageUrl: bookmark.content.imageUrl || ogData.imageUrl || validatedOgMetadata.image || undefined,
                    }
                  : {
                      type: "link",
                      url: bookmark.url,
                      title: validatedOgMetadata.title || bookmark.title,
                      description: validatedOgMetadata.description || bookmark.description,
                      imageUrl: ogData.imageUrl || validatedOgMetadata.image || undefined,
                    };

                if (isDev) {
                  console.log(`[Bookmarks OpenGraph] [DEV] Enhanced bookmark ${bookmark.id} with OpenGraph data`);
                }
                return bookmark;
              }

              if (isDev) {
                console.log(`[Bookmarks OpenGraph] [DEV] No valid OpenGraph data for ${bookmark.url}, using fallback`);
              }

              // Use selectBestImage helper for consistent fallback logic
              const fallbackImage = selectBestImage(bookmark, { preferOpenGraph: false });
              if (fallbackImage) {
                const fallbackBookmark: UnifiedBookmark = {
                  ...bookmark,
                  ogImage: bookmark.ogImage || fallbackImage,
                };

                if (isDev) {
                  console.log(`[Bookmarks OpenGraph] [DEV] Enhanced bookmark ${bookmark.id} with Karakeep fallback`);
                }

                return fallbackBookmark;
              }

              return bookmark;
            } catch (ogError) {
              const errorMessage = ogError instanceof Error ? ogError.message : String(ogError);
              console.error(
                `[Bookmarks OpenGraph] OpenGraph fetch failed for bookmark ${bookmark.id} (${bookmark.url}):`,
                errorMessage,
              );
              if (isDev) {
                console.error("[Bookmarks OpenGraph] [DEV] Full error details:", ogError);
              }

              // Still use Karakeep fallback on error
              const errorFallbackImage = selectBestImage(bookmark, { preferOpenGraph: false });
              if (errorFallbackImage) {
                const fallbackBookmark: UnifiedBookmark = {
                  ...bookmark,
                  ogImage: bookmark.ogImage || errorFallbackImage,
                };

                if (isDev) {
                  console.log(`[Bookmarks OpenGraph] [DEV] Using Karakeep fallback after error for ${bookmark.id}`);
                }

                return fallbackBookmark;
              }

              return bookmark;
            }
          }

          // Handle case where ogData has error but might have fallback images
          if (ogData?.error) {
            if (isDev) {
              console.log(`[Bookmarks OpenGraph] [DEV] OpenGraph unavailable for ${bookmark.url}: ${ogData.error}`);
            }

            // Check if we got any usable image from the fallback result
            if (ogData.imageUrl) {
              const fallbackBookmark: UnifiedBookmark = {
                ...bookmark,
                ogImage: bookmark.ogImage || ogData.imageUrl,
              };

              if (isDev) {
                console.log(
                  `[Bookmarks OpenGraph] [DEV] Using fallback image from OpenGraph result for ${bookmark.id}`,
                );
              }

              return fallbackBookmark;
            }

            // No image from OpenGraph, try Karakeep fallback
            const fallbackImage = selectBestImage(bookmark, { preferOpenGraph: false });
            if (fallbackImage) {
              const fallbackBookmark: UnifiedBookmark = {
                ...bookmark,
                ogImage: bookmark.ogImage || fallbackImage,
              };

              if (isDev) {
                console.log(
                  `[Bookmarks OpenGraph] [DEV] Using Karakeep fallback for ${bookmark.id} after OpenGraph error`,
                );
              }

              return fallbackBookmark;
            }
          }

          return bookmark;
        } catch (ogError) {
          const errorMessage = ogError instanceof Error ? ogError.message : String(ogError);
          console.error(
            `[Bookmarks OpenGraph] OpenGraph fetch failed for bookmark ${bookmark.id} (${bookmark.url}):`,
            errorMessage,
          );
          if (isDev) {
            console.error("[Bookmarks OpenGraph] [DEV] Full error details:", ogError);
          }

          // Still use Karakeep fallback on error
          const errorFallbackImage = selectBestImage(bookmark, { preferOpenGraph: false });
          if (errorFallbackImage) {
            const fallbackBookmark: UnifiedBookmark = {
              ...bookmark,
              ogImage: bookmark.ogImage || errorFallbackImage,
            };

            if (isDev) {
              console.log(`[Bookmarks OpenGraph] [DEV] Using Karakeep fallback after error for ${bookmark.id}`);
            }

            return fallbackBookmark;
          }

          return bookmark;
        }
      }),
    );

    enrichedBookmarks.push(...batchResults);
    const batchDuration = Date.now() - batchStartTime;
    console.log(`[Bookmarks OpenGraph] Batch ${batchNumber}/${totalBatches} completed in ${batchDuration}ms`);

    // Add a delay between batches to be respectful to external services
    if (i + batchSize < bookmarks.length) {
      // Use randomized jitter to prevent thundering herd when multiple instances process simultaneously
      const { randomInt } = await import("node:crypto");
      const delayMs = randomInt(500, 2000); // Random 500-2000ms delay for multi-instance coordination
      if (isDev) {
        console.log(`[Bookmarks OpenGraph] [DEV] Waiting ${delayMs}ms (jittered) before next batch`);
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const totalDuration = Date.now() - startTime;
  console.log(`[Bookmarks OpenGraph] Completed processing ${enrichedBookmarks.length} bookmarks in ${totalDuration}ms`);

  return enrichedBookmarks;
}
