// __tests__/lib/bookmarks.s3.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { refreshBookmarksData } from '@/lib/bookmarks';
import { readJsonS3 } from '@/lib/s3-utils'; // Only need read for info logging
import { ServerCacheInstance } from '@/lib/server-cache';
import type { UnifiedBookmark } from '@/types';

// S3 key from lib/bookmarks.ts
const S3_BOOKMARKS_FILE_KEY_TEST = 'data/bookmarks/bookmarks.json';

describe.skip('refreshBookmarksData - S3 Integration Test (No Mocks/Spies)', () => {

  beforeEach(() => {
    // Clear cache before each test
    ServerCacheInstance.clearBookmarks();
  });

  afterEach(() => {
    // No mocks or spies to restore
  });

  it('should run refreshBookmarksData and rely on console logs for S3 write behavior verification', async () => {
    // This test relies on real S3 and real API access.
    // Verification of S3 write/skip behavior requires MANUAL INSPECTION of console logs during test execution.

    console.log(`[Test Run] Executing refreshBookmarksData against live S3 and API...`);
    let initialS3Count = 0;
    try {
      const initialS3Content = await readJsonS3<UnifiedBookmark[]>(S3_BOOKMARKS_FILE_KEY_TEST);
      initialS3Count = initialS3Content?.length ?? 0;
      console.log(`[Test Info] Initial S3 content for ${S3_BOOKMARKS_FILE_KEY_TEST} has ${initialS3Count} items.`);
    } catch (e) {
      console.warn(`[Test Info] Could not read initial S3 content for ${S3_BOOKMARKS_FILE_KEY_TEST}:`, e);
    }

    let resultBookmarks: UnifiedBookmark[] = [];
    let errorOccurred = false;
    try {
      resultBookmarks = await refreshBookmarksData();
    } catch (e) {
      errorOccurred = true;
      console.error("[Test Error] refreshBookmarksData threw an error:", e);
    }

    // Basic Assertions
    expect(errorOccurred).toBe(false); // Function should complete without throwing
    expect(resultBookmarks).toBeInstanceOf(Array); // Should return an array

    // Log information for manual verification
    console.log(`[Test Result] refreshBookmarksData completed. Result has ${resultBookmarks.length} items.`);
    console.log("---------------------------------------------------------------------");
    console.log("MANUAL VERIFICATION NEEDED:");
    console.log("Check the console output above this message for logs from refreshBookmarksData.");
    console.log("Look for either:");
    console.log("  - '[Bookmarks] Refresh: No changes detected... Skipping S3 write.'");
    console.log("  OR");
    console.log("  - '[Bookmarks] Refresh: Changes detected. Writing updated bookmarks to S3...'");
    console.log("Confirm this matches the expected behavior based on the current API vs S3 state.");
    console.log("---------------------------------------------------------------------");

    // We cannot assert programmatically about S3 writes or cache updates without spies/mocks.

  }, 30000); // Increased timeout for real network calls + manual inspection time
});
