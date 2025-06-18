/**
 * @file Script to refresh all OpenGraph images
 * @description
 * This script iterates through all bookmarks, checks if their OpenGraph images
 * are present in S3, and triggers a fetch and upload for any missing images.
 * This is useful for backfilling the S3 persistent storage after changes to the image
 * persistence logic.
 */

import "dotenv/config"; // Make sure all environment variables are loaded
import { getBookmarks } from "@/lib/data-access/bookmarks";
import { getOpenGraphData } from "@/lib/data-access/opengraph";
import { isValidImageUrl } from "@/lib/utils/opengraph-utils";

/**
 * Processes a promise with a timeout, returning a fallback value if timeout occurs
 * @param promise - Promise to execute
 * @param timeoutMs - Timeout in milliseconds
 * @param timeoutValue - Value to return if timeout occurs
 * @returns Promise that resolves to either the result or timeout value
 */
async function processWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutValue: T
): Promise<T> {
  const timeout = new Promise<T>((resolve) => 
    setTimeout(() => resolve(timeoutValue), timeoutMs)
  );
  return Promise.race([promise, timeout]);
}

async function refreshAllOpenGraphImages() {
  console.log("Starting the refresh process for all OpenGraph images...");

  try {
    // 1. Fetch all bookmarks from your persistent storage (S3), skipping a full remote refresh.
    const bookmarks = await getBookmarks(true);
    console.log(`Found ${bookmarks.length} bookmarks to process.`);

    if (bookmarks.length === 0) {
      console.log("No bookmarks found. Exiting.");
      return;
    }

    // 2. Process bookmarks in parallel batches with timeout protection
    const BATCH_SIZE = 5; // Process 5 bookmarks concurrently
    const ITEM_TIMEOUT_MS = 15000; // 15 seconds per item
    
    let processedCount = 0;
    let successCount = 0;
    let failureCount = 0;
    let timeoutCount = 0;

    // Process bookmarks in batches
    for (let i = 0; i < bookmarks.length; i += BATCH_SIZE) {
      const batch = bookmarks.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(bookmarks.length / BATCH_SIZE);
      
      console.log(`\nProcessing batch ${batchNumber}/${totalBatches} (${batch.length} items)`);
      
      // Process batch items in parallel with timeout protection
      const batchPromises = batch.map(async (bookmark) => {
        processedCount++;
        const itemNumber = processedCount;
        
        if (!bookmark.url) {
          console.log(
            `[${itemNumber}/${bookmarks.length}] Skipping bookmark ${bookmark.id} (no URL)`,
          );
          return { status: 'skipped' };
        }

        console.log(`[${itemNumber}/${bookmarks.length}] Processing: ${bookmark.url}`);

        try {
          // Wrap the OpenGraph fetch in a timeout
          const ogDataPromise = getOpenGraphData(bookmark.url, false, bookmark.id);
          const ogData = await processWithTimeout(
            ogDataPromise,
            ITEM_TIMEOUT_MS,
            null
          );

          if (!ogData) {
            console.warn(`  ⏱️ Timeout: Processing took too long for ${bookmark.url}`);
            timeoutCount++;
            return { status: 'timeout' };
          }

          if (ogData && isValidImageUrl(ogData.imageUrl) && !ogData.error) {
            console.log(`  ✅ Success: Image for ${bookmark.url} is stored or was just processed.`);
            successCount++;
            return { status: 'success' };
          }

          console.warn(
            `  ⚠️ Warning: Could not process OpenGraph data for ${bookmark.url}. Error: ${ogData?.error || "No image URL found"}`,
          );
          failureCount++;
          return { status: 'failed' };
        } catch (error) {
          console.error(`  ❌ Error processing ${bookmark.url}:`, error);
          failureCount++;
          return { status: 'error' };
        }
      });
      
      // Wait for all items in batch to complete
      await Promise.allSettled(batchPromises);
      
      // Add a small delay between batches to prevent overwhelming services
      if (i + BATCH_SIZE < bookmarks.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    console.log("\n--- Refresh Complete ---");
    console.log(`Total bookmarks processed: ${processedCount}`);
    console.log(`Successfully processed images: ${successCount}`);
    console.log(`Failed to process: ${failureCount}`);
    console.log(`Timed out: ${timeoutCount}`);
    console.log("------------------------\n");
  } catch (error) {
    console.error("A critical error occurred during the image refresh script:", error);
    process.exit(1);
  }
}

void refreshAllOpenGraphImages();
