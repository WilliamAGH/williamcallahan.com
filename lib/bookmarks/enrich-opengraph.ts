/**
 * OpenGraph Enrichment Module
 *
 * Handles fetching and enriching bookmarks with OpenGraph metadata
 *
 * @module lib/bookmarks/enrich-opengraph
 */

import { BOOKMARKS_API_CONFIG } from "@/lib/constants";
import { getOpenGraphData } from "@/lib/data-access/opengraph";
import { createKarakeepFallback, selectBestImage } from "./bookmark-helpers";
import type { UnifiedBookmark } from "@/types/bookmark";
import { ogMetadataSchema } from "@/types/seo/opengraph";

const LOG_PREFIX = "[Bookmarks OpenGraph]";

/**
 * Process bookmarks in batches to fetch OpenGraph data
 * Simplified to process sequentially without complex batching
 */
export async function processBookmarksInBatches(
  bookmarks: UnifiedBookmark[],
  isDev: boolean,
): Promise<UnifiedBookmark[]> {
  const startTime = Date.now();
  console.log(`${LOG_PREFIX} Starting OpenGraph enrichment for ${bookmarks.length} bookmarks`);

  // Process sequentially with a small delay between requests
  const enrichedBookmarks: UnifiedBookmark[] = [];
  for (let i = 0; i < bookmarks.length; i++) {
    const bookmark = bookmarks[i];
    if (!bookmark) continue; // Type guard

    if (!bookmark.url) {
      enrichedBookmarks.push(bookmark);
      continue;
    }

    try {
      // Extract Karakeep image data for fallback
      const karakeepFallback = createKarakeepFallback(bookmark.content, BOOKMARKS_API_CONFIG.API_URL);

      if (isDev && i % 10 === 0) {
        console.log(`${LOG_PREFIX} [DEV] Processing ${i + 1}/${bookmarks.length}`);
      }

      // First check if we already have a good image from Karakeep
      const karakeepImage = selectBestImage(bookmark, { preferOpenGraph: false });
      if (karakeepImage && !bookmark.ogImage) {
        console.log(`${LOG_PREFIX} Using existing Karakeep image for ${bookmark.url}`);
        bookmark.ogImage = karakeepImage;
        enrichedBookmarks.push(bookmark);
        continue;
      }

      const ogData = await getOpenGraphData(bookmark.url, false, bookmark.id, karakeepFallback);

      // Small delay between requests to avoid overwhelming services
      if (i < bookmarks.length - 1) {
        await new Promise((r) => setTimeout(r, 100));
      }

      // Apply OpenGraph data if available
      if (ogData && !ogData.error && ogData.ogMetadata) {
        const result = ogMetadataSchema.safeParse(ogData.ogMetadata);
        if (result.success) {
          const metadata = result.data;
          bookmark.title = metadata.title || bookmark.title;
          bookmark.description = metadata.description || bookmark.description;
          bookmark.ogImage = bookmark.ogImage || ogData.imageUrl || metadata.image || karakeepImage || undefined;

          // Update content if it exists
          if (bookmark.content) {
            if (bookmark.content.title === "Untitled Bookmark") {
              bookmark.content.title = metadata.title || bookmark.content.title;
            }
            if (bookmark.content.description === "No description available.") {
              bookmark.content.description = metadata.description || bookmark.content.description;
            }
            bookmark.content.imageUrl = bookmark.content.imageUrl || ogData.imageUrl || metadata.image || undefined;
          }
        }
      } else {
        // Use Karakeep image as fallback
        bookmark.ogImage = bookmark.ogImage || karakeepImage || (ogData?.imageUrl || undefined);
      }
      enrichedBookmarks.push(bookmark);
    } catch (error) {
      if (isDev) {
        console.error(`${LOG_PREFIX} [DEV] Error processing ${bookmark.url}:`, error);
      }
      enrichedBookmarks.push(bookmark); // Also push on error to not lose it
    }
  }

  const totalDuration = Date.now() - startTime;
  console.log(`${LOG_PREFIX} Completed enrichment in ${totalDuration}ms`);

  return enrichedBookmarks;
}
