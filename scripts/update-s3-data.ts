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

// Command-line argument parsing for selective updates
const usage = `Usage: update-s3-data.ts [options]
Options:
  --bookmarks           Run only the Bookmarks update
  --github-activity     Run only the GitHub Activity update
  --logos               Run only the Logos update
  --help, -h            Show this help message
If no options are provided, all updates will run.
`;
const rawArgs = process.argv.slice(2);
if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
  console.log(usage);
  process.exit(0);
}
const runBookmarksFlag = rawArgs.length === 0 || rawArgs.includes('--bookmarks');
const runGithubFlag = rawArgs.length === 0 || rawArgs.includes('--github-activity');
const runLogosFlag = rawArgs.length === 0 || rawArgs.includes('--logos');

// --- Configuration & Constants ---
const VERBOSE = process.env.VERBOSE === 'true';
const S3_DATA_ROOT = 'data'; // Root prefix in S3 for this application's data

console.log(`[UpdateS3] Script execution started. Raw args: ${process.argv.slice(2).join(' ')}`);

// --- Data Update Functions ---

async function updateBookmarksInS3() {
  console.log('[UpdateS3] AB Starting Bookmarks update to S3...');
  try {
    // Pass skipExternalFetch: false to ensure it tries to get new data
    console.log('[UpdateS3] [Bookmarks] Calling getBookmarks with skipExternalFetch=false.');
    const bookmarks = await getBookmarks(false);

    if (bookmarks && bookmarks.length > 0) {
      console.log(`[UpdateS3] [Bookmarks] getBookmarks returned ${bookmarks.length} bookmarks. S3 write should have occurred within getBookmarks.`);
    } else {
      console.warn('[UpdateS3] [Bookmarks] getBookmarks returned no bookmarks or failed. Check data-access logs.');
    }
  } catch (error) {
    console.error('[UpdateS3] [Bookmarks] CRITICAL Error during Bookmarks S3 update process:', error);
  }
}

async function updateGithubActivityInS3() {
  console.log('[UpdateS3] 🐙 Starting GitHub Activity update to S3...');

  try {
    // getGithubActivity will be modified to:
    // 1. Read existing raw weekly stats from S3.
    // 2. Fetch new data from GitHub API.
    // 3. Merge and write back to S3 (for each repo's raw stats) ONLY IF data changed.
    // 4. Recalculate and write aggregated/summary files to S3 ONLY IF underlying data changed.
    const activity = await getGithubActivity(); // This should now be S3-aware

    if (activity) {
      // Writes to S3 (raw files, aggregated, summary) should happen within getGithubActivity / calculateAndStoreAggregatedWeeklyActivity
      console.log(`[UpdateS3] ✅ GitHub Activity update process triggered. Trailing year data complete: ${activity?.trailingYearData?.dataComplete} (check data-access logs for S3 write details).`);
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
  console.log('[UpdateS3] 🖼️ Starting Logos update to S3...');

  try {
    const domains = new Set<string>();

    // 1. Extract domains from bookmarks via data-access
    const bookmarks = await getBookmarks(true); // reuse freshly-cached data
    (bookmarks ?? []).forEach(b => {
      try {
        if (b.url) domains.add(new URL(b.url).hostname.replace(/^www\./, ''));
      } catch { /* ignore invalid URLs */ }
    });
    if (VERBOSE) console.log(`[UpdateS3] Extracted ${domains.size} domains from bookmarks.`);

    // 2. Extract domains from investments data
    const investmentDomainsMap = await getInvestmentDomainsAndIds();
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
  console.log(`[UpdateS3] runScheduledUpdates called. Current PT: ${new Date().toISOString()}`);
  console.log(`[UpdateS3] Configured S3 Root: ${S3_DATA_ROOT}`);
  console.log(`[UpdateS3] Verbose logging: ${VERBOSE}`);
  const DRY_RUN = process.env.DRY_RUN === 'true';
  if (DRY_RUN) {
    console.log('[UpdateS3] DRY RUN mode: skipping all update processes.');
    console.log('[UpdateS3] All scheduled update checks complete.');
    process.exit(0);
  }

  // Ensure S3_BUCKET is configured before proceeding
  if (!process.env.S3_BUCKET) {
    console.error("[UpdateS3] CRITICAL: S3_BUCKET environment variable is not set. Cannot run updates.");
    return; // Exit the main function to allow natural termination
  }

  // Run selected updates sequentially
  if (runBookmarksFlag) {
    console.log('[UpdateS3] --bookmarks flag is true or no flags provided. Running Bookmarks update.');
    await updateBookmarksInS3();
  } else if (VERBOSE) console.log('[UpdateS3] Skipping Bookmarks update as flag was not set.');
  if (runGithubFlag) {
    await updateGithubActivityInS3(); // This includes sub-calculation for aggregated data
  } else if (VERBOSE) console.log('[UpdateS3] Skipping GitHub Activity update');
  if (runLogosFlag) {
    await updateLogosInS3();
  } else if (VERBOSE) console.log('[UpdateS3] Skipping Logos update');

  console.log('[UpdateS3] All scheduled update checks complete.');
  process.exit(0);
}

// Run the main function
void runScheduledUpdates().catch(error => {
  console.error('[UpdateS3] Unhandled error in runScheduledUpdates:', error);
  process.exit(1);
});
