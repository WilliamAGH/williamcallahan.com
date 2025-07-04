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
  useBatchMode = false,
): Promise<UnifiedBookmark[]> {
  const startTime = Date.now();
  console.log(
    `${LOG_PREFIX} Starting OpenGraph enrichment for ${bookmarks.length} bookmarks${useBatchMode ? " (batch mode)" : ""}`,
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
  for (let i = 0; i < bookmarks.length; i++) {
    const bookmark = bookmarks[i];
    if (!bookmark) continue; // Type guard

    if (!bookmark.url) {
      enrichedBookmarks.push(bookmark);
      continue;
    }

    try {
      // Extract Karakeep image data for fallback with bookmark ID as idempotency key
      const karakeepFallback = createKarakeepFallback(bookmark.content, BOOKMARKS_API_CONFIG.API_URL, bookmark.id);

      // Show detailed progress in batch mode or dev mode
      if ((useBatchMode || isDev) && i % 10 === 0 && i > 0) {
        console.log(`${LOG_PREFIX} ===== Progress: ${i}/${bookmarks.length} bookmarks analyzed =====`);
        console.log(`${LOG_PREFIX} Image Sources:`);
        console.log(`${LOG_PREFIX}   - Using Karakeep fallback: ${imageStats.bookmarksUsingKarakeepImage}`);
        console.log(`${LOG_PREFIX}   - Using OpenGraph: ${imageStats.bookmarksUsingOpenGraphImage}`);
        console.log(`${LOG_PREFIX}   - Already in S3: ${imageStats.bookmarksUsingS3Image}`);
        console.log(`${LOG_PREFIX}   - No image found: ${imageStats.bookmarksWithoutImages}`);
        console.log(`${LOG_PREFIX} Persistence Status:`);
        if (useBatchMode) {
          console.log(`${LOG_PREFIX}   - NEW images persisted to S3: ${imageStats.imagesNewlyPersisted}`);
          console.log(`${LOG_PREFIX}   - Images already stored: ${imageStats.imagesAlreadyInS3}`);
        } else {
          console.log(
            `${LOG_PREFIX}   - Images scheduled for background persistence: ${imageStats.imagesNewlyPersisted}`,
          );
          console.log(`${LOG_PREFIX}   - Images already stored: ${imageStats.imagesAlreadyInS3}`);
        }
        console.log(`${LOG_PREFIX}   - Processing errors: ${imageStats.bookmarksWithErrors}`);
      }

      // First check if we already have a good image from Karakeep
      const karakeepImage = selectBestImage(bookmark, { preferOpenGraph: false });

      // If we have a Karakeep image that's not an API proxy URL, persist it to S3
      if (karakeepImage && !karakeepImage.startsWith("/api/assets/")) {
        // Check if it's already an S3 URL
        if (karakeepImage.includes(process.env.NEXT_PUBLIC_S3_CDN_URL || "")) {
          bookmark.ogImage = karakeepImage;
          imageStats.bookmarksUsingS3Image++;
          imageStats.imagesAlreadyInS3++;
          console.log(`${LOG_PREFIX} 📦 Karakeep image already in S3: ${karakeepImage}`);
        } else {
          // It's an external URL from Karakeep, persist it to S3
          if (useBatchMode) {
            const { persistImageAndGetS3UrlWithStatus } = await import("@/lib/persistence/s3-persistence");
            const { OPENGRAPH_IMAGES_S3_DIR } = await import("@/lib/constants");
            const result = await persistImageAndGetS3UrlWithStatus(
              karakeepImage,
              OPENGRAPH_IMAGES_S3_DIR,
              "Karakeep",
              bookmark.id,
              bookmark.url,
            );
            if (result.s3Url) {
              bookmark.ogImage = result.s3Url;
              imageStats.bookmarksUsingS3Image++;
              if (result.wasNewlyPersisted) {
                imageStats.imagesNewlyPersisted++;
                console.log(`${LOG_PREFIX} ✅ Karakeep image newly persisted to S3: ${result.s3Url}`);
              } else {
                imageStats.imagesAlreadyInS3++;
                console.log(`${LOG_PREFIX} ✅ Karakeep image already in S3: ${result.s3Url}`);
              }
            } else {
              bookmark.ogImage = karakeepImage;
              imageStats.bookmarksUsingKarakeepImage++;
              console.warn(`${LOG_PREFIX} ⚠️ Failed to persist Karakeep image, using original: ${karakeepImage}`);
            }
          } else {
            // Runtime mode - schedule async persistence
            const { scheduleImagePersistence } = await import("@/lib/persistence/s3-persistence");
            const { OPENGRAPH_IMAGES_S3_DIR } = await import("@/lib/constants");
            scheduleImagePersistence(karakeepImage, OPENGRAPH_IMAGES_S3_DIR, "Karakeep", bookmark.id, bookmark.url);
            bookmark.ogImage = karakeepImage;
            imageStats.bookmarksUsingKarakeepImage++;
            imageStats.imagesNewlyPersisted++;
            console.log(`${LOG_PREFIX} 📋 Karakeep image scheduled for S3 persistence: ${karakeepImage}`);
          }
        }

        enrichedBookmarks.push(bookmark);
        continue;
      }

      // Use batch mode when running from data-updater
      const ogData = useBatchMode
        ? await getOpenGraphDataBatch(bookmark.url, karakeepFallback)
        : await getOpenGraphData(bookmark.url, false, bookmark.id, karakeepFallback);

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

          // Track image status and source
          const finalImage = ogData.imageUrl || metadata.image || karakeepImage;
          if (finalImage) {
            // ALWAYS persist images to S3 if they're not already there
            if (finalImage.includes(process.env.NEXT_PUBLIC_S3_CDN_URL || "")) {
              // Already in S3
              bookmark.ogImage = finalImage;
              imageStats.bookmarksUsingS3Image++;
              imageStats.imagesAlreadyInS3++;
              console.log(`${LOG_PREFIX} 📦 Using existing S3 image: ${finalImage}`);
            } else if (!finalImage.startsWith("/api/assets/")) {
              // External URL - persist to S3
              const imageSource = ogData.imageUrl ? "OpenGraph" : metadata.image ? "OpenGraphMetadata" : "Karakeep";

              if (useBatchMode) {
                const { persistImageAndGetS3UrlWithStatus } = await import("@/lib/persistence/s3-persistence");
                const { OPENGRAPH_IMAGES_S3_DIR } = await import("@/lib/constants");
                const result = await persistImageAndGetS3UrlWithStatus(
                  finalImage,
                  OPENGRAPH_IMAGES_S3_DIR,
                  imageSource,
                  bookmark.id,
                  bookmark.url,
                );
                if (result.s3Url) {
                  bookmark.ogImage = result.s3Url;
                  imageStats.bookmarksUsingS3Image++;
                  if (result.wasNewlyPersisted) {
                    imageStats.imagesNewlyPersisted++;
                    console.log(`${LOG_PREFIX} ✅ ${imageSource} image newly persisted to S3: ${result.s3Url}`);
                  } else {
                    imageStats.imagesAlreadyInS3++;
                    console.log(`${LOG_PREFIX} ✅ ${imageSource} image already in S3: ${result.s3Url}`);
                  }
                } else {
                  bookmark.ogImage = finalImage;
                  if (imageSource === "Karakeep") {
                    imageStats.bookmarksUsingKarakeepImage++;
                  } else {
                    imageStats.bookmarksUsingOpenGraphImage++;
                  }
                  console.warn(`${LOG_PREFIX} ⚠️ Failed to persist ${imageSource} image, using original: ${finalImage}`);
                }
              } else {
                // Runtime mode - schedule async persistence
                const { scheduleImagePersistence } = await import("@/lib/persistence/s3-persistence");
                const { OPENGRAPH_IMAGES_S3_DIR } = await import("@/lib/constants");
                scheduleImagePersistence(finalImage, OPENGRAPH_IMAGES_S3_DIR, imageSource, bookmark.id, bookmark.url);
                bookmark.ogImage = finalImage;
                if (imageSource === "Karakeep") {
                  imageStats.bookmarksUsingKarakeepImage++;
                } else {
                  imageStats.bookmarksUsingOpenGraphImage++;
                }
                imageStats.imagesNewlyPersisted++;
                console.log(`${LOG_PREFIX} 📋 ${imageSource} image scheduled for S3 persistence: ${finalImage}`);
              }
            } else {
              // API proxy URL - fetch and persist it to get S3 URL
              if (useBatchMode) {
                // Extract asset ID from /api/assets/{id}
                const assetIdMatch = finalImage.match(/\/api\/assets\/([a-f0-9-]+)/);
                if (assetIdMatch?.[1]) {
                  const assetId = assetIdMatch[1];
                  console.log(`${LOG_PREFIX} 🔄 Fetching Karakeep asset for persistence: ${assetId}`);

                  // Fetch the asset directly from Karakeep API
                  try {
                    // Get the base URL from bookmarks API config
                    const bookmarksApiUrl = BOOKMARKS_API_CONFIG.API_URL;
                    const bearerToken = BOOKMARKS_API_CONFIG.BEARER_TOKEN;

                    if (!bearerToken) {
                      throw new Error("Bearer token not configured");
                    }

                    // Extract base URL (remove /api/v1 from the end)
                    const baseUrl = bookmarksApiUrl.replace(/\/api\/v1\/?$/, "");
                    const karakeepAssetUrl = `${baseUrl}/api/assets/${assetId}`;

                    console.log(`${LOG_PREFIX} 🔄 Fetching Karakeep asset directly: ${karakeepAssetUrl}`);

                    const assetResponse = await fetch(karakeepAssetUrl, {
                      headers: {
                        Authorization: `Bearer ${bearerToken}`,
                        "User-Agent": "williamcallahan.com/1.0",
                        Accept: "*/*",
                      },
                      signal: AbortSignal.timeout(30000), // 30 second timeout
                    });

                    if (assetResponse.ok) {
                      // Get content type and persist to S3
                      const contentType = assetResponse.headers.get("content-type") || "image/png";
                      const imageBuffer = Buffer.from(await assetResponse.arrayBuffer());

                      // Import S3 persistence utilities
                      const { persistImageAndGetS3UrlWithStatus } = await import("@/lib/persistence/s3-persistence");
                      const { OPENGRAPH_IMAGES_S3_DIR } = await import("@/lib/constants");

                      // Create a data URL for persistence
                      const base64 = imageBuffer.toString("base64");
                      const dataUrl = `data:${contentType};base64,${base64}`;

                      const result = await persistImageAndGetS3UrlWithStatus(
                        dataUrl,
                        OPENGRAPH_IMAGES_S3_DIR,
                        "KarakeepAsset",
                        assetId, // Use asset ID as idempotency key
                        bookmark.url,
                      );

                      if (result.s3Url) {
                        bookmark.ogImage = result.s3Url;
                        imageStats.bookmarksUsingS3Image++;
                        if (result.wasNewlyPersisted) {
                          imageStats.imagesNewlyPersisted++;
                          console.log(`${LOG_PREFIX} ✅ Karakeep asset newly persisted to S3: ${result.s3Url}`);
                        } else {
                          imageStats.imagesAlreadyInS3++;
                          console.log(`${LOG_PREFIX} ✅ Karakeep asset already in S3: ${result.s3Url}`);
                        }
                      } else {
                        // Fallback to proxy URL if S3 persistence failed
                        bookmark.ogImage = finalImage;
                        imageStats.bookmarksUsingKarakeepImage++;
                        imageStats.karakeepFallbackDetails.push({ url: bookmark.url, karakeepImage: finalImage });
                        console.warn(
                          `${LOG_PREFIX} ⚠️ Failed to persist Karakeep asset to S3, using proxy: ${finalImage}`,
                        );
                      }
                    } else {
                      // Fallback to proxy URL if fetch failed
                      bookmark.ogImage = finalImage;
                      imageStats.bookmarksUsingKarakeepImage++;
                      imageStats.karakeepFallbackDetails.push({ url: bookmark.url, karakeepImage: finalImage });
                      console.warn(
                        `${LOG_PREFIX} ⚠️ Failed to fetch Karakeep asset (${assetResponse.status}), using proxy: ${finalImage}`,
                      );
                    }
                  } catch (error) {
                    bookmark.ogImage = finalImage;
                    imageStats.bookmarksUsingKarakeepImage++;
                    imageStats.karakeepFallbackDetails.push({ url: bookmark.url, karakeepImage: finalImage });
                    console.error(`${LOG_PREFIX} ❌ Error fetching Karakeep asset for bookmark ${bookmark.url}:`);
                    console.error(`${LOG_PREFIX}   Asset ID: ${assetId}`);
                    console.error(`${LOG_PREFIX}   Error: ${error instanceof Error ? error.message : String(error)}`);
                    imageStats.errorDetails.push({
                      url: bookmark.url,
                      error: `Karakeep asset fetch failed: ${error instanceof Error ? error.message : String(error)}`,
                    });
                  }
                } else {
                  bookmark.ogImage = finalImage;
                  imageStats.bookmarksUsingKarakeepImage++;
                  console.log(`${LOG_PREFIX} 🔄 Using Karakeep API proxy (no asset ID): ${finalImage}`);
                }
              } else {
                // Runtime mode - use proxy URL as-is
                bookmark.ogImage = finalImage;
                imageStats.bookmarksUsingKarakeepImage++;
                console.log(`${LOG_PREFIX} 🔄 Using Karakeep API proxy: ${finalImage}`);
              }
            }
          } else {
            imageStats.bookmarksWithoutImages++;
            console.warn(`${LOG_PREFIX} ⚠️ No image found for bookmark: ${bookmark.url} (ID: ${bookmark.id})`);
          }

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
        } else {
          console.error(
            `${LOG_PREFIX} ❌ Failed to parse OpenGraph metadata for ${bookmark.url}: ${result.error.message}`,
          );
          imageStats.bookmarksWithErrors++;
          imageStats.errorDetails.push({ url: bookmark.url, error: `Invalid metadata: ${result.error.message}` });
        }
      } else {
        // Log why we couldn't get OpenGraph data
        if (ogData?.error) {
          console.error(`${LOG_PREFIX} ❌ OpenGraph fetch error for ${bookmark.url}: ${ogData.error}`);
          imageStats.bookmarksWithErrors++;
          imageStats.errorDetails.push({ url: bookmark.url, error: ogData.error });
        }

        // Use Karakeep image as fallback
        const fallbackImage = karakeepImage || ogData?.imageUrl || undefined;
        if (fallbackImage) {
          // Handle Karakeep fallback images
          if (karakeepImage && !karakeepImage.startsWith("/api/assets/")) {
            // External Karakeep URL - persist it to S3
            if (karakeepImage.includes(process.env.NEXT_PUBLIC_S3_CDN_URL || "")) {
              bookmark.ogImage = karakeepImage;
              imageStats.bookmarksUsingS3Image++;
              imageStats.imagesAlreadyInS3++;
              console.log(`${LOG_PREFIX} 📦 Karakeep fallback already in S3: ${karakeepImage}`);
            } else {
              // Persist external Karakeep URL to S3
              if (useBatchMode) {
                const { persistImageAndGetS3UrlWithStatus } = await import("@/lib/persistence/s3-persistence");
                const { OPENGRAPH_IMAGES_S3_DIR } = await import("@/lib/constants");
                const result = await persistImageAndGetS3UrlWithStatus(
                  karakeepImage,
                  OPENGRAPH_IMAGES_S3_DIR,
                  "KarakeepFallback",
                  bookmark.id,
                  bookmark.url,
                );
                if (result.s3Url) {
                  bookmark.ogImage = result.s3Url;
                  imageStats.bookmarksUsingS3Image++;
                  if (result.wasNewlyPersisted) {
                    imageStats.imagesNewlyPersisted++;
                    console.log(`${LOG_PREFIX} ✅ Karakeep fallback newly persisted to S3: ${result.s3Url}`);
                  } else {
                    imageStats.imagesAlreadyInS3++;
                    console.log(`${LOG_PREFIX} ✅ Karakeep fallback already in S3: ${result.s3Url}`);
                  }
                } else {
                  bookmark.ogImage = karakeepImage;
                  imageStats.bookmarksUsingKarakeepImage++;
                  imageStats.karakeepFallbackDetails.push({ url: bookmark.url, karakeepImage });
                  console.warn(`${LOG_PREFIX} ⚠️ Failed to persist Karakeep fallback, using original: ${karakeepImage}`);
                }
              } else {
                // Runtime mode - schedule async persistence
                const { scheduleImagePersistence } = await import("@/lib/persistence/s3-persistence");
                const { OPENGRAPH_IMAGES_S3_DIR } = await import("@/lib/constants");
                scheduleImagePersistence(
                  karakeepImage,
                  OPENGRAPH_IMAGES_S3_DIR,
                  "KarakeepFallback",
                  bookmark.id,
                  bookmark.url,
                );
                bookmark.ogImage = karakeepImage;
                imageStats.bookmarksUsingKarakeepImage++;
                imageStats.karakeepFallbackDetails.push({ url: bookmark.url, karakeepImage });
                imageStats.imagesNewlyPersisted++;
                console.log(`${LOG_PREFIX} 📋 Karakeep fallback scheduled for S3 persistence: ${karakeepImage}`);
              }
            }
          } else if (karakeepImage) {
            // API proxy URL - fetch and persist in batch mode
            if (useBatchMode && karakeepImage.startsWith("/api/assets/")) {
              // Extract asset ID from /api/assets/{id}
              const assetIdMatch = karakeepImage.match(/\/api\/assets\/([a-f0-9-]+)/);
              if (assetIdMatch?.[1]) {
                const assetId = assetIdMatch[1];
                console.log(`${LOG_PREFIX} 🔄 Fetching Karakeep fallback asset for persistence: ${assetId}`);

                // Fetch the asset directly from Karakeep API
                try {
                  // Get the base URL from bookmarks API config
                  const bookmarksApiUrl = BOOKMARKS_API_CONFIG.API_URL;
                  const bearerToken = BOOKMARKS_API_CONFIG.BEARER_TOKEN;

                  if (!bearerToken) {
                    throw new Error("Bearer token not configured");
                  }

                  // Extract base URL (remove /api/v1 from the end)
                  const baseUrl = bookmarksApiUrl.replace(/\/api\/v1\/?$/, "");
                  const karakeepAssetUrl = `${baseUrl}/api/assets/${assetId}`;

                  console.log(`${LOG_PREFIX} 🔄 Fetching Karakeep fallback asset directly: ${karakeepAssetUrl}`);

                  const assetResponse = await fetch(karakeepAssetUrl, {
                    headers: {
                      Authorization: `Bearer ${bearerToken}`,
                      "User-Agent": "williamcallahan.com/1.0",
                      Accept: "*/*",
                    },
                    signal: AbortSignal.timeout(30000), // 30 second timeout
                  });

                  if (assetResponse.ok) {
                    // Get content type and persist to S3
                    const contentType = assetResponse.headers.get("content-type") || "image/png";
                    const imageBuffer = Buffer.from(await assetResponse.arrayBuffer());

                    // Import S3 persistence utilities
                    const { persistImageAndGetS3UrlWithStatus } = await import("@/lib/persistence/s3-persistence");
                    const { OPENGRAPH_IMAGES_S3_DIR } = await import("@/lib/constants");

                    // Create a data URL for persistence
                    const base64 = imageBuffer.toString("base64");
                    const dataUrl = `data:${contentType};base64,${base64}`;

                    const result = await persistImageAndGetS3UrlWithStatus(
                      dataUrl,
                      OPENGRAPH_IMAGES_S3_DIR,
                      "KarakeepFallbackAsset",
                      assetId, // Use asset ID as idempotency key
                      bookmark.url,
                    );

                    if (result.s3Url) {
                      bookmark.ogImage = result.s3Url;
                      imageStats.bookmarksUsingS3Image++;
                      if (result.wasNewlyPersisted) {
                        imageStats.imagesNewlyPersisted++;
                        console.log(`${LOG_PREFIX} ✅ Karakeep fallback asset newly persisted to S3: ${result.s3Url}`);
                      } else {
                        imageStats.imagesAlreadyInS3++;
                        console.log(`${LOG_PREFIX} ✅ Karakeep fallback asset already in S3: ${result.s3Url}`);
                      }
                    } else {
                      // Fallback to proxy URL if S3 persistence failed
                      bookmark.ogImage = karakeepImage;
                      imageStats.bookmarksUsingKarakeepImage++;
                      imageStats.karakeepFallbackDetails.push({ url: bookmark.url, karakeepImage });
                      console.warn(
                        `${LOG_PREFIX} ⚠️ Failed to persist Karakeep fallback asset to S3, using proxy: ${karakeepImage}`,
                      );
                    }
                  } else {
                    // Fallback to proxy URL if fetch failed
                    bookmark.ogImage = karakeepImage;
                    imageStats.bookmarksUsingKarakeepImage++;
                    imageStats.karakeepFallbackDetails.push({ url: bookmark.url, karakeepImage });
                    console.warn(
                      `${LOG_PREFIX} ⚠️ Failed to fetch Karakeep fallback asset (${assetResponse.status}), using proxy: ${karakeepImage}`,
                    );
                  }
                } catch (error) {
                  bookmark.ogImage = karakeepImage;
                  imageStats.bookmarksUsingKarakeepImage++;
                  imageStats.karakeepFallbackDetails.push({ url: bookmark.url, karakeepImage });
                  console.error(
                    `${LOG_PREFIX} ❌ Error fetching Karakeep fallback asset for bookmark ${bookmark.url}:`,
                  );
                  console.error(`${LOG_PREFIX}   Asset ID: ${assetId}`);
                  console.error(`${LOG_PREFIX}   Error: ${error instanceof Error ? error.message : String(error)}`);
                  imageStats.errorDetails.push({
                    url: bookmark.url,
                    error: `Karakeep fallback asset fetch failed: ${error instanceof Error ? error.message : String(error)}`,
                  });
                }
              } else {
                bookmark.ogImage = karakeepImage;
                imageStats.bookmarksUsingKarakeepImage++;
                imageStats.karakeepFallbackDetails.push({ url: bookmark.url, karakeepImage });
                console.log(`${LOG_PREFIX} 🔄 Using Karakeep API proxy (no asset ID): ${karakeepImage}`);
              }
            } else {
              // Runtime mode or non-asset URL - use proxy URL as-is
              bookmark.ogImage = karakeepImage;
              imageStats.bookmarksUsingKarakeepImage++;
              imageStats.karakeepFallbackDetails.push({ url: bookmark.url, karakeepImage });
              console.log(`${LOG_PREFIX} 🔄 Using Karakeep API proxy fallback: ${karakeepImage}`);
            }
          } else if (ogData?.imageUrl) {
            // OpenGraph image despite error
            bookmark.ogImage = ogData.imageUrl;
            if (ogData.imageUrl.includes(process.env.NEXT_PUBLIC_S3_CDN_URL || "")) {
              imageStats.bookmarksUsingS3Image++;
              imageStats.imagesAlreadyInS3++;
              console.log(`${LOG_PREFIX} 📦 Using S3 image after OpenGraph error: ${ogData.imageUrl}`);
            } else {
              imageStats.bookmarksUsingOpenGraphImage++;
              console.log(`${LOG_PREFIX} 📷 Using OpenGraph image despite error: ${ogData.imageUrl}`);
            }
          }
        } else {
          imageStats.bookmarksWithoutImages++;
          console.warn(`${LOG_PREFIX} ⚠️ No fallback image available after OpenGraph error for: ${bookmark.url}`);
        }
      }
      enrichedBookmarks.push(bookmark);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`${LOG_PREFIX} ❌ Error processing ${bookmark.url}: ${errorMessage}`);
      imageStats.bookmarksWithErrors++;
      imageStats.errorDetails.push({ url: bookmark.url, error: errorMessage });
      enrichedBookmarks.push(bookmark); // Also push on error to not lose it
    }
  }

  const totalDuration = Date.now() - startTime;
  console.log(`${LOG_PREFIX} Completed enrichment in ${totalDuration}ms`);

  // Log comprehensive summary
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
