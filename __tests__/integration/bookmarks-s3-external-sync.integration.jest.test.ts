import 'dotenv/config';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { readJsonS3 } from '../../lib/s3-utils'; // Assumes S3_BUCKET is configured in env
import { refreshBookmarksData } from '../../lib/bookmarks'; // This calls the actual external API
import type { UnifiedBookmark } from '../../types';
import { BOOKMARKS_S3_KEY_FILE } from '../../lib/data-access'; // To get the S3 file key

describe('Integration: Bookmarks S3 vs External API Sync', () => {
  let s3Bookmarks: UnifiedBookmark[] | null = null;
  let externalApiBookmarks: UnifiedBookmark[] | null = null;
  let s3Error: Error | null = null;
  let apiError: Error | null = null;

  beforeAll(async () => {
    // Check for necessary environment variables
    if (!process.env.S3_BUCKET || !process.env.BOOKMARK_BEARER_TOKEN || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY || !process.env.AWS_REGION) {
      console.warn('Skipping S3/External API sync test: Required environment variables (S3_BUCKET, BOOKMARK_BEARER_TOKEN, S3 credentials, AWS_REGION) are not set.');
      // This will cause tests to be skipped if conditions aren't met in 'it' blocks
      return;
    }

    try {
      console.log('[IntegrationTest] Attempting to read from S3 key: ' + BOOKMARKS_S3_KEY_FILE);
      s3Bookmarks = await readJsonS3<UnifiedBookmark[]>(BOOKMARKS_S3_KEY_FILE);
      if (s3Bookmarks === null) { // readJsonS3 returns null on error like object not found
        console.warn('[IntegrationTest] readJsonS3 returned null, S3 file not found/empty at ' + BOOKMARKS_S3_KEY_FILE + '. Treating as 0 bookmarks.');
        s3Bookmarks = [];
      }
    } catch (e) {
      s3Error = e instanceof Error ? e : new Error(String(e));
      console.error('[IntegrationTest] Error reading from S3:', s3Error);
      s3Bookmarks = []; // Treat as empty on error for quantity comparison
    }

    try {
      console.log('[IntegrationTest] Attempting to fetch from external bookmarks API...');
      console.log('[IntegrationTest] BOOKMARK_BEARER_TOKEN before refreshBookmarksData:', process.env.BOOKMARK_BEARER_TOKEN ? 'SET' : 'NOT SET or EMPTY');
      externalApiBookmarks = await refreshBookmarksData();
    } catch (e) {
      apiError = e instanceof Error ? e : new Error(String(e));
      console.error('[IntegrationTest] Error fetching from external API:', apiError);
      externalApiBookmarks = []; // Treat as empty on error
    }

    // Re-read S3 after refreshing external bookmarks to pick up any updates
    try {
      console.log('[IntegrationTest] Re-reading S3 after external API refresh');
      const updated = await readJsonS3<UnifiedBookmark[]>(BOOKMARKS_S3_KEY_FILE);
      if (updated === null) {
        console.warn('[IntegrationTest] readJsonS3 returned null on re-read, treating as empty.');
        s3Bookmarks = [];
      } else {
        s3Bookmarks = updated;
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      console.error('[IntegrationTest] Error re-reading from S3 after refresh:', err);
      s3Bookmarks = s3Bookmarks ?? [];
    }
  });

  it('should have required environment variables set to run', () => {
    if (!process.env.S3_BUCKET || !process.env.BOOKMARK_BEARER_TOKEN || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY || !process.env.AWS_REGION) {
      console.log('Skipping integration tests: missing required environment variables');
      return; // Skip test when env vars are missing
    }
    expect(process.env.S3_BUCKET).toBeDefined();
    expect(process.env.BOOKMARK_BEARER_TOKEN).toBeDefined();
    expect(process.env.S3_ACCESS_KEY_ID).toBeDefined();
    expect(process.env.S3_SECRET_ACCESS_KEY).toBeDefined();
    expect(process.env.AWS_REGION).toBeDefined();
  });

  it('should successfully fetch bookmarks from S3 (or handle its absence)', () => {
    if (!process.env.S3_BUCKET) return; // Skip if S3_BUCKET not set
    expect(s3Error).toBeNull(); // Expect no direct error from S3 read attempt
    expect(s3Bookmarks).toBeInstanceOf(Array);
    console.log('[IntegrationTest] Bookmarks count from S3: ' + (s3Bookmarks?.length ?? 'Error/Not Fetched'));
  });

  it('should successfully fetch bookmarks from the external API', () => {
    if (!process.env.BOOKMARK_BEARER_TOKEN) return; // Skip if token not set
    expect(apiError).toBeNull();
    expect(externalApiBookmarks).toBeInstanceOf(Array);
    console.log('[IntegrationTest] Bookmarks count from External API: ' + (externalApiBookmarks?.length ?? 'Error/Not Fetched'));
  });

  it('should have the same number of bookmarks in S3 as fetched from the external API', () => {
    if (!s3Bookmarks || !externalApiBookmarks) {
      console.warn('[IntegrationTest] Skipping quantity comparison due to fetch errors or missing env vars.');
      expect(true).toBe(true); // Pass benignly if setup failed
      return;
    }

    console.log('[IntegrationTest] FINAL COMPARISON - S3 Count: ' + s3Bookmarks.length + ', External API Count: ' + externalApiBookmarks.length);

    if (s3Bookmarks.length !== externalApiBookmarks.length) {
      console.error('[IntegrationTest] QUANTITY MISMATCH! S3 has ' + s3Bookmarks.length + ', External API has ' + externalApiBookmarks.length + '.');
      // Optionally log differences here if needed for debugging
      // For example, find IDs in one list but not the other
      const s3Ids = new Set(s3Bookmarks.map(b => b.id));
      const externalIds = new Set(externalApiBookmarks.map(b => b.id));
      const inExternalOnly = externalApiBookmarks.filter(b => !s3Ids.has(b.id)).map(b => b.id);
      const inS3Only = s3Bookmarks.filter(b => !externalIds.has(b.id)).map(b => b.id);
      if (inExternalOnly.length > 0) console.error('[IntegrationTest] IDs in External API only: ' + inExternalOnly.join(', '));
      if (inS3Only.length > 0) console.error('[IntegrationTest] IDs in S3 only: ' + inS3Only.join(', '));
    }

    expect(s3Bookmarks.length).toEqual(externalApiBookmarks.length);
  });
});