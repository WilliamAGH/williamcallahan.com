/**
 * @file Script to refresh all OpenGraph images
 * @description
 * This script iterates through all bookmarks, checks if their OpenGraph images
 * are present in S3, and triggers a fetch and upload for any missing images.
 * This is useful for backfilling the S3 persistent storage after changes to the image
 * persistence logic.
 */

import 'dotenv/config'; // Make sure all environment variables are loaded
import { getBookmarks } from '@/lib/data-access/bookmarks';
import { getOpenGraphData } from '@/lib/data-access/opengraph';
import { isValidImageUrl } from '@/lib/utils/opengraph-utils';

async function refreshAllOpenGraphImages() {
  console.log('Starting the refresh process for all OpenGraph images...');

  try {
    // 1. Fetch all bookmarks from your persistent storage (S3), skipping a full remote refresh.
    const bookmarks = await getBookmarks(true); 
    console.log(`Found ${bookmarks.length} bookmarks to process.`);

    if (bookmarks.length === 0) {
      console.log('No bookmarks found. Exiting.');
      return;
    }

    // 2. Iterate through each bookmark and trigger OpenGraph data fetching
    let processedCount = 0;
    let successCount = 0;
    let failureCount = 0;

    for (const bookmark of bookmarks) {
      processedCount++;
      if (!bookmark.url) {
        console.log(`[${processedCount}/${bookmarks.length}] Skipping bookmark ${bookmark.id} (no URL)`);
        continue;
      }

      console.log(`[${processedCount}/${bookmarks.length}] Processing: ${bookmark.url}`);

      try {
        // Calling getOpenGraphData will trigger the caching logic.
        // We set skipExternalFetch to false to allow it to fetch if data is missing.
        const ogData = await getOpenGraphData(bookmark.url, false, bookmark.id);

        if (ogData && isValidImageUrl(ogData.imageUrl) && !ogData.error) {
           // The logic inside getOpenGraphData/refreshOpenGraphData now handles persistence.
           // A success here implies the image is either already in S3 or was just fetched and stored.
          console.log(`  ✅ Success: Image for ${bookmark.url} is stored or was just processed.`);
          successCount++;
        } else {
          console.warn(`  ⚠️ Warning: Could not process OpenGraph data for ${bookmark.url}. Error: ${ogData.error || 'No image URL found'}`);
          failureCount++;
        }
      } catch (error) {
        console.error(`  ❌ Error processing ${bookmark.url}:`, error);
        failureCount++;
      }
       // Add a small delay between requests to be kind to external services
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log('\n--- Refresh Complete ---');
    console.log(`Total bookmarks processed: ${processedCount}`);
    console.log(`Successfully processed images: ${successCount}`);
    console.log(`Failed to process: ${failureCount}`);
    console.log('------------------------\n');

  } catch (error) {
    console.error('A critical error occurred during the image refresh script:', error);
    process.exit(1);
  }
}

void refreshAllOpenGraphImages(); 