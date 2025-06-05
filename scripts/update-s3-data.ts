#!/usr/bin/env ts-node

/**
 * S3 Data Update Script
 *
 * Periodically fetches data from external sources (GitHub, bookmark APIs, logo providers) 
 * and performs differential updates to S3-compatible storage. Designed for external scheduler execution.
 * 
 * Features:
 * - Selective updates via command-line flags
 * - Differential S3 synchronization to minimize redundant writes
 * - Batch processing for logo updates with rate limiting
 * - Comprehensive error handling and logging
 * 
 * MODULE RESOLUTION FIX:
 * Uses explicit .ts extension and @/ path mapping to ensure consistent module 
 * resolution across development and Docker production environments. 
 * Fallback index.ts in lib/data-access/ directory provides additional resolution safety.
 */

// Load environment variables first
import { config } from 'dotenv';
config(); // Load .env file

// Import using @/ path mapping with explicit .ts extension for maximum compatibility
import {
  getBookmarks,
  getGithubActivity,
  getLogo,
  getInvestmentDomainsAndIds,
  calculateAndStoreAggregatedWeeklyActivity,
} from '@/lib/data-access.ts'; // These will be modified to be S3-aware

// Import direct refresh functions for forced updates
import { refreshBookmarksData } from '@/lib/bookmarks.ts';

import { KNOWN_DOMAINS } from '@/lib/constants';

// Import types
import type { UnifiedBookmark } from '@/types/bookmark';

// --- Configuration & Constants ---

/** Environment configuration for verbose logging */
const VERBOSE = process.env.VERBOSE === 'true';

/** Root prefix in S3 for this application's data */
const S3_DATA_ROOT = 'data';

/** Logo batch processing configuration for different scenarios */
const LOGO_BATCH_CONFIGS = {
  /** Immediate processing for new bookmarks (faster, smaller batches) */
  IMMEDIATE: { size: 5, delay: 200 },
  /** Regular bulk processing (larger batches, longer delays for rate limiting) */
  REGULAR: { size: 10, delay: 500 }
} as const;

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

console.log(`[UpdateS3] Script execution started. Raw args: ${process.argv.slice(2).join(' ')}`);

// --- Utility Functions ---

/**
 * Extracts unique domains from an array of bookmark objects
 * @param bookmarks - Array of bookmark objects with url properties
 * @returns Set of unique domain names with www prefix removed
 */
function extractDomainsFromBookmarks(bookmarks: UnifiedBookmark[]): Set<string> {
  const domains = new Set<string>();
  for (const bookmark of bookmarks) {
    try {
      if (bookmark.url) {
        const url = new URL(bookmark.url);
        const domain = url.hostname.replace(/^www\./, '');
        domains.add(domain);
      }
    } catch (error) {
      // Log invalid URLs for debugging while continuing processing
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`[UpdateS3] Invalid URL in bookmark ${bookmark.id || 'unknown'}: ${bookmark.url} (${errorMessage})`);
    }
  }
  return domains;
}

/**
 * Processes logo fetching for domains in batches with rate limiting
 * @param domains - Array of domain names to process
 * @param batchConfig - Configuration object with batch size and delay
 * @param context - Description of the processing context for logging
 * @returns Promise resolving to success and failure counts
 */
async function processLogoBatch(
  domains: string[], 
  batchConfig: typeof LOGO_BATCH_CONFIGS.IMMEDIATE | typeof LOGO_BATCH_CONFIGS.REGULAR,
  context: string
): Promise<{ successCount: number; failureCount: number }> {
  let successCount = 0;
  let failureCount = 0;
  const { size: batchSize, delay } = batchConfig;

  for (let i = 0; i < domains.length; i += batchSize) {
    const batch = domains.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(domains.length / batchSize);
    
    console.log(`[UpdateS3] Processing ${context} logo batch ${batchNumber}/${totalBatches} for ${batch.length} domains`);

    const promises = batch.map(async (domain) => {
      try {
        const logoResult = await getLogo(domain);
        if (logoResult?.buffer && Buffer.isBuffer(logoResult.buffer) && logoResult.buffer.length > 0) {
          console.log(`✅ Logo processed for ${domain} via data-access (source: ${logoResult.source})`);
          successCount++;
        } else {
          console.warn(`⚠️ Could not fetch/process logo for ${domain} via data-access.`);
          failureCount++;
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`❌ Error processing logo for ${domain}:`, message);
        failureCount++;
      }
    });

    await Promise.allSettled(promises);

    // Apply rate limiting delay between batches (except for the last batch)
    if (i + batchSize < domains.length) {
      if (VERBOSE) console.log(`[UpdateS3] ⏱️ Waiting ${delay}ms before next ${context} logo batch...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  return { successCount, failureCount };
}

// --- Data Update Functions ---

/**
 * Updates bookmark data in S3 storage
 * Fetches fresh bookmark data, ensures S3 synchronization, and immediately processes logos for new bookmarks
 */
async function updateBookmarksInS3(): Promise<void> {
  console.log('[UpdateS3] AB Starting Bookmarks update to S3...');
  try {
    // Get current cached bookmarks to compare for new additions
    const previousBookmarks = await getBookmarks(false); // Get cached data
    const previousBookmarkIds = new Set(previousBookmarks?.map(b => b.id) || []);

    // Use direct refresh function to force fresh data instead of cached data
    console.log('[UpdateS3] [Bookmarks] Calling refreshBookmarksData to force fresh fetch.');
    const bookmarks = await refreshBookmarksData();

    if (bookmarks && bookmarks.length > 0) {
      console.log(`[UpdateS3] [Bookmarks] refreshBookmarksData returned ${bookmarks.length} fresh bookmarks and wrote to S3.`);
      
      // Identify new bookmarks that weren't in the previous cache
      const newBookmarks = bookmarks.filter(b => !previousBookmarkIds.has(b.id));
      
      if (newBookmarks.length > 0) {
        console.log(`[UpdateS3] [Bookmarks] Found ${newBookmarks.length} new bookmarks. Processing logos immediately to prevent broken images.`);
        
        // Extract domains from new bookmarks only
        const newDomains = extractDomainsFromBookmarks(newBookmarks);
        
        if (newDomains.size > 0) {
          console.log(`[UpdateS3] [Bookmarks] Processing logos for ${newDomains.size} new domains immediately.`);
          
          // Process new domains with immediate batch configuration for faster UX
          const { successCount, failureCount } = await processLogoBatch(
            Array.from(newDomains),
            LOGO_BATCH_CONFIGS.IMMEDIATE,
            'immediate new bookmarks'
          );
          
          console.log(`[UpdateS3] [Bookmarks] ✅ Immediate logo processing complete: ${successCount} succeeded, ${failureCount} failed for new bookmarks.`);
        }
      } else {
        console.log('[UpdateS3] [Bookmarks] No new bookmarks detected. Skipping immediate logo processing.');
      }
    } else {
      console.warn('[UpdateS3] [Bookmarks] refreshBookmarksData returned no bookmarks or failed. Check logs.');
    }
  } catch (error) {
    console.error('[UpdateS3] [Bookmarks] CRITICAL Error during Bookmarks S3 update process:', error);
  }
}

/**
 * Updates GitHub activity data in S3 storage
 * Fetches new GitHub data, merges with existing S3 data, and recalculates aggregated statistics
 */
async function updateGithubActivityInS3(): Promise<void> {
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

/**
 * Updates logo assets in S3 storage
 * Collects domains from bookmarks, investments, and known sources, then fetches/caches logos in batches
 */
async function updateLogosInS3(): Promise<void> {
  console.log('[UpdateS3] 🖼️ Starting Logos update to S3...');

  try {
    const domains = new Set<string>();

    // 1. Extract domains from bookmarks via data-access
    const bookmarks = await getBookmarks(true); // reuse freshly-cached data
    const bookmarkDomains = extractDomainsFromBookmarks(bookmarks ?? []);
    for (const domain of bookmarkDomains) {
      domains.add(domain);
    }
    if (VERBOSE) console.log(`[UpdateS3] Extracted ${bookmarkDomains.size} domains from bookmarks.`);

    // 2. Extract domains from investments data - simplified iteration using .values()
    const investmentDomainsMap = await getInvestmentDomainsAndIds();
    for (const domain of investmentDomainsMap.values()) {
      domains.add(domain);
    }
    if (VERBOSE) console.log(`[UpdateS3] Added ${investmentDomainsMap.size} unique domains from investments. Total unique: ${domains.size}`);

    // 3. Domains from experience.ts / education.ts (assuming these are static or also in S3)
    // For simplicity, this part is omitted but would follow a similar pattern: read from S3 or use static data.
    // If these files are static in the repo, their parsing logic can remain.

    // 4. Add hardcoded domains from centralized constant
    for (const domain of KNOWN_DOMAINS) {
      domains.add(domain);
    }
    if (VERBOSE) console.log(`[UpdateS3] Added ${KNOWN_DOMAINS.length} hardcoded domains. Total unique domains for logos: ${domains.size}`);

    // Process all domains using regular batch configuration with appropriate rate limiting
    const { successCount, failureCount } = await processLogoBatch(
      Array.from(domains),
      LOGO_BATCH_CONFIGS.REGULAR,
      'bulk logo update'
    );
    
    console.log(`[UpdateS3] ✅ Logo update process triggered. ${successCount} succeeded, ${failureCount} failed (check data-access logs for S3 write details).`);

  } catch (error) {
    console.error('[UpdateS3] ❌ Error during logos S3 update:', error);
  }
}

// --- Main Execution ---

/**
 * Main execution function that orchestrates all scheduled S3 data updates
 * Handles environment validation, flag processing, and sequential update execution
 */
async function runScheduledUpdates(): Promise<void> {
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

// Run the main function with comprehensive error handling
void runScheduledUpdates().catch(error => {
  console.error('[UpdateS3] Unhandled error in runScheduledUpdates:', error);
  process.exit(1);
});
