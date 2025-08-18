/**
 * OpenGraph Enrichment Module
 *
 * Handles fetching and enriching bookmarks with OpenGraph metadata
 *
 * @module lib/bookmarks/enrich-opengraph
 */

import { BOOKMARKS_API_CONFIG } from "@/lib/constants";
import { getOpenGraphData } from "@/lib/data-access/opengraph";
import { getOpenGraphDataBatch } from "@/lib/data-access/opengraph-batch";
import { selectBestImage } from "./bookmark-helpers";
import { extractMarkdownContent, applyExtractedContent } from "./extract-markdown";
import type { UnifiedBookmark } from "@/types/bookmark";

const LOG_PREFIX = "[Bookmarks OpenGraph]";

/**
 * Process bookmarks in batches to fetch OpenGraph data
 * Simplified to process sequentially without complex batching
 */
export async function processBookmarksInBatches(
  bookmarks: UnifiedBookmark[],
  isDev: boolean,
  useBatchMode = false,
  extractContent = false,
): Promise<UnifiedBookmark[]> {
  void isDev; // Unused parameter
  const startTime = Date.now();
  console.log(
    `${LOG_PREFIX} Starting OpenGraph enrichment for ${bookmarks.length} bookmarks${useBatchMode ? " (batch mode)" : ""}${extractContent ? " with content extraction" : ""}`,
  );

  // Track detailed image statistics
  const imageStats = {
    totalBookmarks: bookmarks.length,
    // Image source tracking
    bookmarksUsingKarakeepImage: 0,
    bookmarksUsingOpenGraphImage: 0,
    bookmarksUsingS3Image: 0,
    bookmarksWithoutImages: 0,
    // Persistence tracking
    imagesNewlyPersisted: 0,
    imagesAlreadyInS3: 0,
    // Error tracking
    bookmarksWithErrors: 0,
    errorDetails: [] as Array<{ url: string; error: string }>,
    // Karakeep fallback tracking
    karakeepFallbackDetails: [] as Array<{ url: string; karakeepImage: string }>,
  };

  // Process sequentially with a small delay between requests
  const enrichedBookmarks: UnifiedBookmark[] = [];
  const s3CdnUrl = process.env.NEXT_PUBLIC_S3_CDN_URL || process.env.S3_CDN_URL || "";

  for (let i = 0; i < bookmarks.length; i++) {
    const bookmark = bookmarks[i];
    if (!bookmark) continue; // Type guard

    if (!bookmark.url) {
      enrichedBookmarks.push(bookmark);
      continue;
    }

    try {
      // 1. Skip if already processed with S3 CDN URL
      if (bookmark.ogImage?.includes(s3CdnUrl)) {
        imageStats.imagesAlreadyInS3++;
        imageStats.bookmarksUsingS3Image++;
        enrichedBookmarks.push(bookmark);
        continue;
      }

      // 2. Determine the best source URL - Karakeep data takes priority
      let sourceImageUrl: string | undefined | null = selectBestImage(bookmark, {
        includeScreenshots: true,
        returnUndefined: false,
      });

      let finalImageSource = "Unknown";
      let shouldFetchOpenGraph = false;

      // Check what type of image we got
      if (sourceImageUrl) {
        if (sourceImageUrl.includes("/api/assets/")) {
          // This is a Karakeep-hosted asset
          finalImageSource = "Karakeep";
          imageStats.bookmarksUsingKarakeepImage++;
          imageStats.karakeepFallbackDetails.push({
            url: bookmark.url,
            karakeepImage: sourceImageUrl,
          });
        } else if (sourceImageUrl.includes(s3CdnUrl)) {
          // Already persisted to S3
          finalImageSource = "S3";
          imageStats.bookmarksUsingS3Image++;
        } else {
          // Regular HTTP URL (either from Karakeep or our own fetch)
          finalImageSource = "OpenGraph";
          imageStats.bookmarksUsingOpenGraphImage++;
        }
      } else {
        // No image from Karakeep, should fetch ourselves
        shouldFetchOpenGraph = true;
      }

      // 3. Only fetch OpenGraph ourselves if Karakeep provided nothing
      if (shouldFetchOpenGraph) {
        finalImageSource = "OpenGraph";
        try {
          const ogData = useBatchMode
            ? await getOpenGraphDataBatch(bookmark.url)
            : await getOpenGraphData(bookmark.url, false, bookmark.id);

          if (ogData?.ogMetadata?.image) {
            sourceImageUrl = ogData.ogMetadata.image;
            bookmark.title = ogData.ogMetadata.title || bookmark.title;
            bookmark.description = ogData.ogMetadata.description || bookmark.description;
            imageStats.bookmarksUsingOpenGraphImage++;
          }
        } catch (e: unknown) {
          const error = e instanceof Error ? e : new Error(String(e));
          console.error(`${LOG_PREFIX} ❌ OpenGraph fetch for ${bookmark.url} failed: ${error.message}`);
          imageStats.bookmarksWithErrors++;
          imageStats.errorDetails.push({ url: bookmark.url, error: error.message });
          sourceImageUrl = null;
        }
      }

      // 4. Process the determined source URL
      if (sourceImageUrl) {
        // Handle Karakeep/Hoarder asset URLs differently
        let absoluteImageUrl: string | null = sourceImageUrl;

        if (sourceImageUrl.startsWith("/api/assets/")) {
          // For Karakeep assets, we need to download them directly from the API
          // Extract the asset ID from the URL (/api/assets/[id])
          const assetId = sourceImageUrl.replace("/api/assets/", "");

          if (process.env.IS_DATA_UPDATER === "true") {
            // In batch mode, we can fetch directly from Karakeep API
            console.log(`${LOG_PREFIX} 🔗 Fetching Karakeep asset directly for S3 persistence: ${assetId}`);

            // Fetch the actual image buffer from Karakeep
            const imageBuffer = await fetchKarakeepImage(assetId);

            if (imageBuffer) {
              // Save the buffer to S3 and get the CDN URL
              const { persistImageBufferToS3 } = await import("@/lib/persistence/s3-persistence");
              const { OPENGRAPH_IMAGES_S3_DIR } = await import("@/lib/constants");

              const s3Url = await persistImageBufferToS3(
                imageBuffer,
                OPENGRAPH_IMAGES_S3_DIR,
                assetId,
                finalImageSource,
                bookmark.id,
                bookmark.url,
              );

              if (s3Url) {
                bookmark.ogImage = s3Url;
                bookmark.ogImageExternal = sourceImageUrl;
                imageStats.bookmarksUsingS3Image++;
                imageStats.imagesNewlyPersisted++;
                console.log(`${LOG_PREFIX} ✅ Successfully persisted Karakeep asset to S3: ${s3Url}`);
                // Skip the normal persistence flow since we already handled it
                sourceImageUrl = null;
                absoluteImageUrl = null;
              } else {
                console.error(`${LOG_PREFIX} ❌ Failed to persist Karakeep asset to S3: ${assetId}`);
                sourceImageUrl = null;
                absoluteImageUrl = null;
              }
            } else {
              console.error(`${LOG_PREFIX} ❌ Failed to fetch Karakeep asset: ${assetId}`);
              sourceImageUrl = null;
              absoluteImageUrl = null;
            }
          } else {
            // In web runtime, we can't fetch from Karakeep directly
            // Just use the relative URL and let the client handle it
            absoluteImageUrl = sourceImageUrl;
            console.log(`${LOG_PREFIX} 🔗 Web runtime: Using relative URL for Karakeep asset: ${absoluteImageUrl}`);
          }
        }

        // Only proceed if we still have a valid image URL
        if (sourceImageUrl && absoluteImageUrl) {
          const { persistImageAndGetS3UrlWithStatus } = await import("@/lib/persistence/s3-persistence");
          const { OPENGRAPH_IMAGES_S3_DIR } = await import("@/lib/constants");
          const result = await persistImageAndGetS3UrlWithStatus(
            absoluteImageUrl,
            OPENGRAPH_IMAGES_S3_DIR,
            finalImageSource,
            bookmark.id,
            bookmark.url,
          );

          if (result.s3Url) {
            // ✅ Successfully stored in S3 – use CDN URL
            bookmark.ogImage = result.s3Url;
            bookmark.ogImageExternal = absoluteImageUrl;
            imageStats.bookmarksUsingS3Image++;
            if (result.wasNewlyPersisted) imageStats.imagesNewlyPersisted++;
          } else {
            // ❌ Could not persist primary image. Try screenshot asset as secondary fallback before giving up.
            const screenshotId = bookmark.content?.screenshotAssetId;
            if (screenshotId) {
              const { getAssetUrl } = await import("./bookmark-helpers");
              const ssUrl = getAssetUrl(screenshotId);
              if (ssUrl) {
                // Use relative URL for screenshot fallback too
                bookmark.ogImage = ssUrl; // Keep relative: /api/assets/[id]
                bookmark.ogImageExternal = ssUrl;
                imageStats.bookmarksUsingKarakeepImage++;
                console.log(`${LOG_PREFIX} 📸 Using relative URL for screenshot fallback: ${ssUrl}`);
              } else {
                bookmark.ogImage = undefined;
                bookmark.ogImageExternal = absoluteImageUrl;
                imageStats.bookmarksWithoutImages++;
              }
            } else {
              bookmark.ogImage = undefined;
              bookmark.ogImageExternal = absoluteImageUrl;
              imageStats.bookmarksWithoutImages++;
            }
          }
        } else {
          // No valid image URL after processing
          bookmark.ogImage = undefined;
          bookmark.ogImageExternal = undefined;
          imageStats.bookmarksWithoutImages++;
        }
      } else {
        // No image found from any source
        bookmark.ogImage = undefined;
        bookmark.ogImageExternal = undefined;
        imageStats.bookmarksWithoutImages++;
      }

      // 7. Extract markdown content if enabled (memory-efficient: one at a time)
      if (extractContent) {
        try {
          const content = await extractMarkdownContent(bookmark);
          if (content) {
            applyExtractedContent(bookmark, content);
            console.log(
              `${LOG_PREFIX}   📝 Extracted ${content.wordCount} words (${content.readingTime}min read) from ${bookmark.url}`,
            );
          }
        } catch (contentError) {
          console.warn(`${LOG_PREFIX}   ⚠️ Failed to extract content for ${bookmark.url}:`, contentError);
        }
      }

      enrichedBookmarks.push(bookmark);
    } catch (e: unknown) {
      const error = e instanceof Error ? e : new Error(String(e));
      console.error(`${LOG_PREFIX} ❌ Outer error for ${bookmark.url}: ${error.message}`);
      imageStats.bookmarksWithErrors++;
      imageStats.errorDetails.push({ url: bookmark.url || "unknown", error: error.message });
      // On outer error, assign a placeholder
      bookmark.ogImage = undefined;
      bookmark.ogImageExternal = undefined;
      enrichedBookmarks.push(bookmark);
    }
  }

  // Log comprehensive summary AFTER processing all bookmarks
  const totalDuration = Date.now() - startTime;
  console.log(`${LOG_PREFIX} Completed enrichment in ${totalDuration}ms`);

  console.log(`${LOG_PREFIX} ====== OPENGRAPH ENRICHMENT SUMMARY ======`);
  console.log(`${LOG_PREFIX} Total bookmarks processed: ${imageStats.totalBookmarks}`);
  console.log(`${LOG_PREFIX}`);
  console.log(`${LOG_PREFIX} IMAGE SOURCES BREAKDOWN:`);
  console.log(`${LOG_PREFIX}   📦 Already in S3: ${imageStats.bookmarksUsingS3Image} bookmarks`);
  console.log(`${LOG_PREFIX}   🖼️ OpenGraph images: ${imageStats.bookmarksUsingOpenGraphImage} bookmarks`);
  console.log(`${LOG_PREFIX}   🔄 Karakeep fallback: ${imageStats.bookmarksUsingKarakeepImage} bookmarks`);
  console.log(`${LOG_PREFIX}   ❌ No image found: ${imageStats.bookmarksWithoutImages} bookmarks`);
  console.log(`${LOG_PREFIX}`);
  console.log(`${LOG_PREFIX} PERSISTENCE STATUS:`);
  if (useBatchMode) {
    console.log(`${LOG_PREFIX}   ✅ NEW images persisted to S3: ${imageStats.imagesNewlyPersisted}`);
    console.log(`${LOG_PREFIX}   📦 Images already stored in S3: ${imageStats.imagesAlreadyInS3}`);
  } else {
    console.log(
      `${LOG_PREFIX}   📋 Images scheduled for background S3 persistence: ${imageStats.imagesNewlyPersisted}`,
    );
    console.log(`${LOG_PREFIX}   📦 Images already stored in S3: ${imageStats.imagesAlreadyInS3}`);
  }
  console.log(`${LOG_PREFIX}`);
  console.log(`${LOG_PREFIX} PROCESSING STATS:`);
  const totalWithImages =
    imageStats.bookmarksUsingS3Image + imageStats.bookmarksUsingOpenGraphImage + imageStats.bookmarksUsingKarakeepImage;
  console.log(
    `${LOG_PREFIX}   Total with images: ${totalWithImages} (${Math.round((totalWithImages / imageStats.totalBookmarks) * 100)}%)`,
  );
  console.log(`${LOG_PREFIX}   Processing errors: ${imageStats.bookmarksWithErrors}`);

  if (imageStats.errorDetails.length > 0) {
    console.error(`${LOG_PREFIX} ====== ERROR DETAILS ======`);
    imageStats.errorDetails.forEach((detail, index) => {
      console.error(`${LOG_PREFIX} Error ${index + 1}: ${detail.url}`);
      console.error(`${LOG_PREFIX}   Reason: ${detail.error}`);
    });
  }

  // Alert if no new images were found to persist
  if (imageStats.imagesNewlyPersisted === 0) {
    if (imageStats.bookmarksUsingS3Image === totalWithImages) {
      console.log(`${LOG_PREFIX} ℹ️ All images are already stored in S3 - no new images to persist`);
    } else if (imageStats.bookmarksUsingKarakeepImage > 0 && !useBatchMode) {
      // Only show this warning in runtime mode where we can't persist to S3
      console.warn(
        `${LOG_PREFIX} ⚠️ WARNING: ${imageStats.bookmarksUsingKarakeepImage} bookmarks are using Karakeep proxy URLs`,
      );
      console.warn(`${LOG_PREFIX} ⚠️ These will be persisted to S3 on next batch update`);
      console.warn(`${LOG_PREFIX} ⚠️ Affected bookmarks:`);
      imageStats.karakeepFallbackDetails.forEach((detail, index) => {
        console.warn(`${LOG_PREFIX}   ${index + 1}. ${detail.url}`);
        console.warn(`${LOG_PREFIX}      Image: ${detail.karakeepImage}`);
      });
    } else if (imageStats.bookmarksUsingKarakeepImage > 0 && useBatchMode) {
      // In batch mode, this indicates a problem with S3 persistence
      console.error(
        `${LOG_PREFIX} ❌ ERROR: ${imageStats.bookmarksUsingKarakeepImage} bookmarks failed to persist Karakeep images to S3`,
      );
      console.error(`${LOG_PREFIX} ❌ These bookmarks are still dependent on Karakeep's CDN`);
      console.error(`${LOG_PREFIX} ❌ Check error details above for specific failures`);
      console.error(`${LOG_PREFIX} ❌ Affected bookmarks:`);
      imageStats.karakeepFallbackDetails.forEach((detail, index) => {
        console.error(`${LOG_PREFIX}   ${index + 1}. ${detail.url}`);
        console.error(`${LOG_PREFIX}      Image: ${detail.karakeepImage}`);
      });
    } else if (totalWithImages === 0) {
      console.error(`${LOG_PREFIX} ❌ ERROR: No images found for any bookmarks!`);
    } else {
      console.error(`${LOG_PREFIX} ⚠️ WARNING: No new images were scheduled for S3 persistence!`);
      console.error(`${LOG_PREFIX} ⚠️ This suggests the image persistence system may not be working correctly.`);
    }
  }

  console.log(`${LOG_PREFIX} ========================================`);

  return enrichedBookmarks;
}

/**
 * Fetches an image asset from the Karakeep/Hoarder API using the asset ID
 */
export async function fetchKarakeepImage(assetId: string): Promise<Buffer | null> {
  const bookmarksApiUrl = BOOKMARKS_API_CONFIG.API_URL;
  const bearerToken = BOOKMARKS_API_CONFIG.BEARER_TOKEN;

  if (!bearerToken) {
    console.warn("[fetchKarakeepImage] Bearer token not configured - returning null");
    return null;
  }

  const assetUrl = `${bookmarksApiUrl}/assets/${assetId}`;

  try {
    console.log(`[fetchKarakeepImage] Fetching asset: ${assetId}`);

    const response = await fetch(assetUrl, {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
      },
    });

    if (!response.ok) {
      console.warn(`[fetchKarakeepImage] Failed to fetch asset ${assetId}: ${response.status} ${response.statusText}`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    console.log(`[fetchKarakeepImage] Successfully fetched asset ${assetId} (${buffer.length} bytes)`);
    return buffer;
  } catch (error) {
    console.error(`[fetchKarakeepImage] Error fetching asset ${assetId}:`, error);
    return null;
  }
}
