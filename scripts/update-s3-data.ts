#!/usr/bin/env ts-node

/**
 * S3 Data Update Script
 *
 * This script is responsible for periodically fetching data from external sources
 * (GitHub, bookmark APIs, logo providers) and performing differential updates
 * to an S3-compatible storage. It's designed to be run by an external scheduler
 */

import {
  getBookmarks,
  getGithubActivity,
  getLogo,
  getInvestmentDomainsAndIds,
  calculateAndStoreAggregatedWeeklyActivity,
} from '../lib/data-access'; // These will be modified to be S3-aware
import { readFromS3 } from '../lib/s3-utils';
import type { UnifiedBookmark } from '../types';

// --- Configuration & Constants ---
const VERBOSE = process.env.VERBOSE === 'true';
const S3_DATA_ROOT = 'data'; // Root prefix in S3 for this application's data

// --- Scheduling Configuration (Pacific Time) ---
// For simplicity, this script will check if it's "around" the scheduled time.
// A more robust solution would use a proper cron parser or rely on the scheduler's precision.
const JOB_WINDOW_MINUTES = 15; // +/- 15 minutes around the scheduled time

const GITHUB_ACTIVITY_SCHEDULE_PT = { hour: 3, minute: 0 }; // 3:00 AM PT
const LOGO_SCHEDULE_PT = { hour: 3, minute: 15 }; // 3:15 AM PT
const BOOKMARKS_SCHEDULES_PT = [
  { hour: 3, minute: 30 }, // 3:30 AM PT
  { hour: 11, minute: 30 }, // 11:30 AM PT
  { hour: 19, minute: 30 }, // 7:30 PM PT
];

// --- Helper Functions ---

function getCurrentPacificTime(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
}

function isJobScheduledNow(schedule: { hour: number; minute: number }, nowPt: Date, windowMinutes: number): boolean {
  const scheduledTimeToday = new Date(nowPt);
  scheduledTimeToday.setHours(schedule.hour, schedule.minute, 0, 0);

  const diffMillis = Math.abs(nowPt.getTime() - scheduledTimeToday.getTime());
  const diffMinutes = diffMillis / (1000 * 60);

  return diffMinutes <= windowMinutes;
}

// --- Data Update Functions ---

async function updateBookmarksInS3() {
  console.log('[UpdateS3] 📚 Checking schedule for Bookmarks update...');
  const nowPt = getCurrentPacificTime();
  const shouldRun = BOOKMARKS_SCHEDULES_PT.some(schedule =>isJobScheduledNow(schedule, nowPt, JOB_WINDOW_MINUTES));

  if (!shouldRun) {
    if (VERBOSE) console.log('[UpdateS3] Bookmarks update not scheduled for this time.');
    return;
  }
  console.log('[UpdateS3] 🚀 Starting Bookmarks update to S3...');

  try {
    // getBookmarks will internally handle fetching from external if S3 is empty or stale (logic to be added there)
    // For this script, we assume getBookmarks is now S3-aware and handles its own differential logic.
    // The key is that `getBookmarks()` when called without `skipExternalFetch` should:
    // 1. Try local cache (app server cache, not relevant here directly)
    // 2. Try S3
    // 3. If S3 miss/stale, fetch external, COMPARE with S3 data, then write to S3 if different.
    const bookmarks = await getBookmarks(); // This should now be S3-aware

    if (bookmarks) {
      // The write to S3 should happen within getBookmarks if data changed.
      // This script mainly triggers the process.
      console.log(`[UpdateS3] ✅ Bookmarks update process triggered. ${bookmarks.length} bookmarks processed (check data-access logs for S3 write details).`);
    } else {
      console.error('[UpdateS3] ❌ Failed to process bookmarks for S3 update.');
    }
  } catch (error) {
    console.error('[UpdateS3] ❌ Error during bookmarks S3 update:', error);
  }
}

async function updateGithubActivityInS3() {
  console.log('[UpdateS3] 🐙 Checking schedule for GitHub Activity update...');
  const nowPt = getCurrentPacificTime();
  if (!isJobScheduledNow(GITHUB_ACTIVITY_SCHEDULE_PT, nowPt, JOB_WINDOW_MINUTES)) {
    if (VERBOSE) console.log('[UpdateS3] GitHub Activity update not scheduled for this time.');
    return;
  }
  console.log('[UpdateS3] 🚀 Starting GitHub Activity update to S3...');

  try {
    // getGithubActivity will be modified to:
    // 1. Read existing raw weekly stats from S3.
    // 2. Fetch new data from GitHub API.
    // 3. Merge and write back to S3 (for each repo's raw stats) ONLY IF data changed.
    // 4. Recalculate and write aggregated/summary files to S3 ONLY IF underlying data changed.
    const activity = await getGithubActivity(); // This should now be S3-aware

    if (activity) {
      // Writes to S3 (raw files, aggregated, summary) should happen within getGithubActivity / calculateAndStoreAggregatedWeeklyActivity
      console.log(`[UpdateS3] ✅ GitHub Activity update process triggered. Data complete: ${activity.dataComplete} (check data-access logs for S3 write details).`);
      // calculateAndStoreAggregatedWeeklyActivity will also need to be S3-aware
      await calculateAndStoreAggregatedWeeklyActivity(); // This also needs to read/write from/to S3
    } else {
      console.error('[UpdateS3] ❌ Failed to process GitHub activity for S3 update.');
    }
  } catch (error) {
    console.error('[UpdateS3] ❌ Error during GitHub Activity S3 update:', error);
  }
}

async function updateLogosInS3() {
  console.log('[UpdateS3] 🖼️ Checking schedule for Logos update...');
  const nowPt = getCurrentPacificTime();
  if (!isJobScheduledNow(LOGO_SCHEDULE_PT, nowPt, JOB_WINDOW_MINUTES)) {
    if (VERBOSE) console.log('[UpdateS3] Logos update not scheduled for this time.');
    return;
  }
  console.log('[UpdateS3] 🚀 Starting Logos update to S3...');

  try {
    const domains = new Set<string>();

    // 1. Extract domains from bookmarks (fetch from S3)
    const bookmarksKey = `${S3_DATA_ROOT}/bookmarks/bookmarks.json`;
    const s3BookmarksContent = await readFromS3(bookmarksKey);
    if (s3BookmarksContent && typeof s3BookmarksContent === 'string') {
      const bookmarks = JSON.parse(s3BookmarksContent) as UnifiedBookmark[];
      bookmarks.forEach(b => {
        try {
          if (b.url) domains.add(new URL(b.url).hostname.replace(/^www\./, ''));
        } catch { /* ignore */ }
      });
      if (VERBOSE) console.log(`[UpdateS3] Extracted ${domains.size} domains from S3 bookmarks.`);
    }


    // 2. Extract domains from investments data (using data-access, which should be S3-aware or read static)
    const investmentDomainsMap = await getInvestmentDomainsAndIds(); // Added await, removed unnecessary assertion
    investmentDomainsMap.forEach((_id, domain) => domains.add(domain));
    if (VERBOSE) console.log(`[UpdateS3] Added ${investmentDomainsMap.size} unique domains from investments. Total unique: ${domains.size}`);

    // 3. Domains from experience.ts / education.ts (assuming these are static or also in S3)
    // For simplicity, this part is omitted but would follow a similar pattern: read from S3 or use static data.
    // If these files are static in the repo, their parsing logic can remain.

    // 4. Hardcoded domains
    const KNOWN_DOMAINS = ['creighton.edu', 'unomaha.edu', 'stanford.edu', 'columbia.edu', 'gsb.columbia.edu', 'cfp.net', 'seekinvest.com', 'tsbank.com', 'mutualfirst.com', 'morningstar.com'];
    KNOWN_DOMAINS.forEach(domain => domains.add(domain));
    if (VERBOSE) console.log(`[UpdateS3] Added ${KNOWN_DOMAINS.length} hardcoded domains. Total unique domains for logos: ${domains.size}`);

    const domainArray = Array.from(domains);
    let successCount = 0;
    let failureCount = 0;
    const BATCH_SIZE = 10;

    for (let i = 0; i < domainArray.length; i += BATCH_SIZE) {
      const batch = domainArray.slice(i, i + BATCH_SIZE);
      if (VERBOSE) console.log(`[UpdateS3] Processing logo batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(domainArray.length / BATCH_SIZE)} for ${batch.length} domains`);

      const promises = batch.map(async (domain) => {
        try {
          // getLogo will be modified to:
          // 1. Check S3 for the logo.
          // 2. If not in S3, fetch externally.
          // 3. If fetched, write to S3.
          const logoResult = await getLogo(domain); // This should now be S3-aware

          if (logoResult && logoResult.buffer) {
            // S3 write should happen within getLogo if it fetched externally
            if (VERBOSE) console.log(`[UpdateS3] Logo processed for ${domain} (source: ${logoResult.source}). Check data-access for S3 write details.`);
            successCount++;
          } else {
            // If getLogo returns null, it means it couldn't find it in S3 or fetch it.
            if (VERBOSE) console.log(`[UpdateS3] ⚠️ Could not find or fetch logo for ${domain}.`);
            failureCount++;
          }
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[UpdateS3] ❌ Error processing logo for ${domain}:`, message);
          failureCount++;
        }
      });
      await Promise.allSettled(promises);
      if (i + BATCH_SIZE < domainArray.length) {
        if (VERBOSE) console.log('[UpdateS3] ⏱️ Waiting 500ms before next logo batch...');
        await new Promise(r => setTimeout(r, 500));
      }
    }
    console.log(`[UpdateS3] ✅ Logo update process triggered. ${successCount} succeeded, ${failureCount} failed (check data-access logs for S3 write details).`);

  } catch (error) {
    console.error('[UpdateS3] ❌ Error during logos S3 update:', error);
  }
}


// --- Main Execution ---
async function runScheduledUpdates() {
  console.log(`[UpdateS3] Script started. Current PT: ${getCurrentPacificTime().toISOString()}`);
  console.log(`[UpdateS3] Configured S3 Root: ${S3_DATA_ROOT}`);
  console.log(`[UpdateS3] Verbose logging: ${VERBOSE}`);

  // Ensure S3_BUCKET is configured before proceeding
  if (!process.env.S3_BUCKET) {
    console.error("[UpdateS3] CRITICAL: S3_BUCKET environment variable is not set. Cannot run updates.");
    process.exit(1);
  }

  // Run updates sequentially to avoid overwhelming resources or rate limits
  await updateBookmarksInS3();
  await updateGithubActivityInS3(); // This includes sub-calculation for aggregated data
  await updateLogosInS3();

  console.log('[UpdateS3] All scheduled update checks complete.');
  process.exit(0);
}

// Run the main function
void runScheduledUpdates().catch(error => {
  console.error('[UpdateS3] Unhandled error in runScheduledUpdates:', error);
  process.exit(1);
});
