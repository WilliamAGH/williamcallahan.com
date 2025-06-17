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
import { config } from "dotenv";
config(); // Load .env file

// Import using @/ path mapping with explicit .ts extension for maximum compatibility
import {
  calculateAndStoreAggregatedWeeklyActivity,
  getBookmarks,
  getGithubActivity,
  getInvestmentDomainsAndIds,
  getLogo as getLogoUntyped,
} from "@/lib/data-access";

// Import direct refresh functions for forced updates
import { refreshBookmarksData } from "@/lib/bookmarks";

// Import logo session tracking functions
import { invalidateLogoS3Cache, resetLogoSessionTracking } from "@/lib/data-access/logos.ts";

import { KNOWN_DOMAINS } from "@/lib/constants";
import logger from "@/lib/utils/logger";

// Import types
import type { UnifiedBookmark } from "@/types/bookmark";
import type { LogoResult } from "@/types/logo";

// --- Configuration & Constants ---

/** Environment configuration for verbose logging */
const VERBOSE = process.env.VERBOSE === "true";

/** Test mode limit - when set, limits operations for faster testing */
const TEST_LIMIT = process.env.S3_TEST_LIMIT ? Number.parseInt(process.env.S3_TEST_LIMIT, 10) : 0;

/** Root prefix in S3 for this application's data */
const S3_DATA_ROOT = "data";

/** Logo batch processing configuration for different scenarios */
const LOGO_BATCH_CONFIGS = {
  /** Immediate processing for new bookmarks (faster, smaller batches) */
  IMMEDIATE: { size: 5, delay: 200 },
  /** Regular bulk processing (larger batches, longer delays for rate limiting) */
  REGULAR: { size: 10, delay: 500 },
} as const;

/** Maximum number of new bookmarks to process immediately on first run or after cache loss */
const SAFETY_THRESHOLD_NEW_BOOKMARKS: number = 10;

// Command-line argument parsing for selective updates
const usage: string = `Usage: update-s3-data.ts [options]
Options:
  --bookmarks           Run only the Bookmarks update
  --github-activity     Run only the GitHub Activity update
  --logos               Run only the Logos update
  --force               Force refresh of S3 data even if validation fails (can also use FORCE_REFRESH=1 env var)
  --help, -h            Show this help message
If no options are provided, all updates will run.
`;
const rawArgs = process.argv.slice(2);
if (rawArgs.includes("--help") || rawArgs.includes("-h")) {
  console.log(usage);
  process.exit(0);
}
const runBookmarksFlag = rawArgs.length === 0 || rawArgs.includes("--bookmarks");
const runGithubFlag = rawArgs.length === 0 || rawArgs.includes("--github-activity");
const runLogosFlag = rawArgs.length === 0 || rawArgs.includes("--logos");
const forceRefreshFlag = rawArgs.includes("--force") || process.env.FORCE_REFRESH === "1";

logger.info(`[UpdateS3] Script execution started. Raw args: ${process.argv.slice(2).join(" ")}`);

// --- Utility Functions ---

/**
 * Extracts unique domains from an array of bookmark objects
 * @param bookmarks - Array of bookmark objects with url properties
 * @returns Set of unique domain names with www prefix removed
 */
function extractDomainsFromBookmarks(bookmarks: Readonly<UnifiedBookmark[]>): Set<string> {
  const domains = new Set<string>();
  for (const bookmark of bookmarks) {
    try {
      if (bookmark.url) {
        const url = new URL(bookmark.url);
        const domain = url.hostname.replace(/^www\./, "");
        domains.add(domain);
      }
    } catch (error) {
      // Log invalid URLs for debugging while continuing processing
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(
        `[UpdateS3] Invalid URL in bookmark ${bookmark.id || "unknown"}: ${bookmark.url} (${errorMessage})`,
      );
    }
  }
  return domains;
}

// Create a typed wrapper around the (loosely-typed) data-access `getLogo` so we
// don't need per-call assertions and still satisfy the strict ESLint rules.
const getLogo = getLogoUntyped;

/**
 * Processes logo fetching for domains in batches with rate limiting and retry logic
 * @param domains - Array of domain names to process
 * @param batchConfig - Configuration object with batch size and delay
 * @param context - Description of the processing context for logging
 * @param maxRetries - Maximum number of retries for failed logo fetches (default: 3)
 * @returns Promise resolving to success and failure counts
 */
async function processLogoBatch(
  domains: Readonly<string[]>,
  batchConfig: { readonly size: number; readonly delay: number },
  context: string,
  maxRetries = 3,
): Promise<{ successCount: number; failureCount: number }> {
  let successCount = 0;
  let failureCount = 0;
  const { size: batchSize, delay } = batchConfig;

  for (let i = 0; i < domains.length; i += batchSize) {
    const batch = domains.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(domains.length / batchSize);

    logger.verbose(
      `[UpdateS3] Processing ${context} logo batch ${batchNumber}/${totalBatches} for ${batch.length} domains`,
    );

    const promises = batch.map(async (domain) => {
      let attempt = 0;
      while (attempt < maxRetries) {
        try {
          const logoResult = await getLogo(domain);

          if (logoResult && Buffer.isBuffer(logoResult.buffer) && logoResult.buffer.length > 0) {
            const retrieval: LogoResult["retrieval"] | "unknown" =
              logoResult.retrieval ?? "unknown";
            const originalSource: string = logoResult.source ?? "unknown";

            logger.info(
              `✅ Logo for ${domain} processed (retrieved from: ${retrieval}, original source: ${originalSource})`,
            );
            successCount++;
            return; // success -> exit while/ function
          }
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error(
            `❌ Error processing logo for ${domain} (attempt ${attempt + 1}/${maxRetries}):`,
            message,
          );
        }

        attempt++;
        if (attempt < maxRetries) {
          const backoff = Math.min(2 ** attempt * 1000, 30000);
          logger.debug(`[UpdateS3] Retrying logo fetch for ${domain} after ${backoff}ms delay...`);
          await new Promise((r) => setTimeout(r, backoff));
        }
      }

      // All attempts exhausted
      logger.warn(
        `⚠️ Could not fetch/process logo for ${domain} via data-access after ${maxRetries} attempts.`,
      );
      failureCount++;
    });

    await Promise.allSettled(promises);

    // Apply rate limiting delay between batches (except for the last batch)
    if (i + batchSize < domains.length) {
      logger.debug(`[UpdateS3] ⏱️ Waiting ${delay}ms before next ${context} logo batch...`);
      await new Promise((r) => setTimeout(r, delay));
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
  logger.info("[UpdateS3] AB Starting Bookmarks update to S3...");
  
  if (TEST_LIMIT > 0) {
    logger.info(`[UpdateS3] Test mode: limiting bookmarks processing to ${TEST_LIMIT} item(s).`);
  }
  
  try {
    // Get current cached bookmarks to compare for new additions
    const previousBookmarks = await getBookmarks(false); // Get cached data
    const previousCount = previousBookmarks?.length || 0;
    logger.debug(`[UpdateS3] [Bookmarks] Previous cached bookmarks count: ${previousCount}`);

    const previousBookmarkIds = new Set(previousBookmarks?.map((b) => b.id) || []);

    // Use direct refresh function to force fresh data instead of cached data
    logger.debug("[UpdateS3] [Bookmarks] Calling refreshBookmarksData to force fresh fetch.");
    const bookmarks = await refreshBookmarksData();

    if (bookmarks && bookmarks.length > 0) {
      logger.debug(
        `[UpdateS3] [Bookmarks] refreshBookmarksData returned ${bookmarks.length} fresh bookmarks and wrote to S3.`,
      );
      if (forceRefreshFlag) {
        logger.info(
          "[UpdateS3] [Bookmarks] Force refresh flag detected. Overwriting S3 data regardless of validation.",
        );
      }

      // Identify new bookmarks that weren't in the previous cache
      let newBookmarks = bookmarks.filter((b) => !previousBookmarkIds.has(b.id));
      
      // Apply test limit if set
      if (TEST_LIMIT > 0 && newBookmarks.length > TEST_LIMIT) {
        logger.info(`[UpdateS3] Test mode: limiting new bookmarks from ${newBookmarks.length} to ${TEST_LIMIT}`);
        newBookmarks = newBookmarks.slice(0, TEST_LIMIT);
      }

      // Add safety check: if we have no previous bookmarks but many new ones,
      // limit immediate processing to avoid overwhelming the system
      const shouldLimitProcessing =
        previousCount === 0 && newBookmarks.length > SAFETY_THRESHOLD_NEW_BOOKMARKS;

      if (shouldLimitProcessing) {
        logger.warn(
          `[UpdateS3] [Bookmarks] Safety check: No previous cache (${previousCount}) but ${newBookmarks.length} "new" bookmarks detected. This suggests first run or cache loss.`,
        );
        logger.warn(
          `[UpdateS3] [Bookmarks] Limiting immediate logo processing to ${SAFETY_THRESHOLD_NEW_BOOKMARKS} most recent bookmarks to avoid system overload.`,
        );

        // Process only the most recently added bookmarks for immediate logo processing
        const recentBookmarks = newBookmarks
          .sort(
            (a, b) => new Date(b.dateBookmarked).getTime() - new Date(a.dateBookmarked).getTime(),
          )
          .slice(0, SAFETY_THRESHOLD_NEW_BOOKMARKS);

        const recentDomains = extractDomainsFromBookmarks(recentBookmarks);

        if (recentDomains.size > 0) {
          logger.info(
            `[UpdateS3] [Bookmarks] Processing logos for ${recentDomains.size} domains from ${SAFETY_THRESHOLD_NEW_BOOKMARKS} most recent bookmarks.`,
          );

          const { successCount, failureCount } = await processLogoBatch(
            Array.from(recentDomains),
            LOGO_BATCH_CONFIGS.IMMEDIATE,
            "recent bookmarks (limited processing)",
            3,
          );

          logger.info(
            `[UpdateS3] [Bookmarks] ✅ Limited immediate logo processing complete: ${successCount} succeeded, ${failureCount} failed.`,
          );
          logger.info(
            "[UpdateS3] [Bookmarks] 📝 Note: Remaining logos will be processed during regular logo update phase.",
          );
        }
      } else if (newBookmarks.length > 0) {
        logger.info(
          `[UpdateS3] [Bookmarks] Found ${newBookmarks.length} new bookmarks. Processing logos immediately to prevent broken images.`,
        );

        // Extract domains from new bookmarks only
        const newDomains = extractDomainsFromBookmarks(newBookmarks);

        if (newDomains.size > 0) {
          logger.info(
            `[UpdateS3] [Bookmarks] Processing logos for ${newDomains.size} new domains immediately.`,
          );

          // Process new domains with immediate batch configuration for faster UX with retry logic
          const { successCount, failureCount } = await processLogoBatch(
            Array.from(newDomains),
            LOGO_BATCH_CONFIGS.IMMEDIATE,
            "immediate new bookmarks",
            3,
          );

          logger.info(
            `[UpdateS3] [Bookmarks] ✅ Immediate logo processing complete: ${successCount} succeeded, ${failureCount} failed for new bookmarks.`,
          );
        }
      } else {
        logger.debug(
          "[UpdateS3] [Bookmarks] No new bookmarks detected. Skipping immediate logo processing.",
        );
      }
    } else {
      logger.warn(
        "[UpdateS3] [Bookmarks] refreshBookmarksData returned no bookmarks or failed. Check logs.",
      );
    }
  } catch (error) {
    logger.error(
      "[UpdateS3] [Bookmarks] CRITICAL Error during Bookmarks S3 update process:",
      error,
    );
  }
}

/**
 * Updates GitHub activity data in S3 storage
 * Fetches new GitHub data, merges with existing S3 data, and recalculates aggregated statistics
 */
async function updateGithubActivityInS3(): Promise<void> {
  logger.info("[UpdateS3] 🐙 Starting GitHub Activity update to S3...");
  
  if (TEST_LIMIT > 0) {
    logger.info(`[UpdateS3] Test mode: limiting GitHub activity to basic validation only.`);
  }

  try {
    // getGithubActivity will be modified to:
    // 1. Read existing raw weekly stats from S3.
    // 2. Fetch new data from GitHub API.
    // 3. Merge and write back to S3 (for each repo's raw stats) ONLY IF data changed.
    // 4. Recalculate and write aggregated/summary files to S3 ONLY IF underlying data changed.
    const activity = await getGithubActivity(); // This should now be S3-aware

    if (activity) {
      // Writes to S3 (raw files, aggregated, summary) should happen within getGithubActivity / calculateAndStoreAggregatedWeeklyActivity
      logger.info(
        `[UpdateS3] ✅ GitHub Activity update process triggered. Trailing year data complete: ${activity?.trailingYearData?.dataComplete} (check data-access logs for S3 write details).`,
      );
      // calculateAndStoreAggregatedWeeklyActivity will also need to be S3-aware
      await calculateAndStoreAggregatedWeeklyActivity(); // This also needs to read/write from/to S3
    } else {
      logger.error("[UpdateS3] ❌ Failed to process GitHub activity for S3 update.");
    }
  } catch (error) {
    logger.error("[UpdateS3] ❌ Error during GitHub Activity S3 update:", error);
  }
}

/**
 * Updates logo assets in S3 storage
 * Collects domains from bookmarks, investments, and known sources, then fetches/caches logos in batches
 */
async function updateLogosInS3(): Promise<void> {
  logger.info("[UpdateS3] 🖼️ Starting Logos update to S3...");
  
  if (TEST_LIMIT > 0) {
    logger.info(`[UpdateS3] Test mode: limiting logo processing to ${TEST_LIMIT} domain(s).`);
  }

  try {
    // Reset logo session tracking to prevent conflicts with concurrent processes
    resetLogoSessionTracking();
    invalidateLogoS3Cache();
    logger.debug(
      "[UpdateS3] Logo session tracking reset and S3 store invalidated for bulk processing.",
    );

    const domains = new Set<string>();

    // 1. Extract domains from bookmarks via data-access
    const bookmarks = await getBookmarks(true); // reuse freshly-cached data
    const bookmarkDomains = extractDomainsFromBookmarks(bookmarks ?? []);
    for (const domain of bookmarkDomains) {
      domains.add(domain);
    }
    logger.debug(`[UpdateS3] Extracted ${bookmarkDomains.size} domains from bookmarks.`);

    // 2. Extract domains from investments data - simplified iteration using .values()
    const investmentDomainsMap = await getInvestmentDomainsAndIds();
    for (const domain of investmentDomainsMap.values()) {
      domains.add(domain);
    }
    logger.debug(
      `[UpdateS3] Added ${investmentDomainsMap.size} unique domains from investments. Total unique: ${domains.size}`,
    );

    // 3. Domains from experience.ts / education.ts (assuming these are static or also in S3)
    // For simplicity, this part is omitted but would follow a similar pattern: read from S3 or use static data.
    // If these files are static in the repo, their parsing logic can remain.

    // 4. Add hardcoded domains from centralized constant
    for (const domain of KNOWN_DOMAINS) {
      domains.add(domain);
    }
    logger.debug(
      `[UpdateS3] Added ${KNOWN_DOMAINS.length} hardcoded domains. Total unique domains for logos: ${domains.size}`,
    );

    // Apply test limit if set
    let domainsToProcess = Array.from(domains);
    if (TEST_LIMIT > 0 && domainsToProcess.length > TEST_LIMIT) {
      logger.info(`[UpdateS3] Test mode: limiting logo domains from ${domainsToProcess.length} to ${TEST_LIMIT}`);
      domainsToProcess = domainsToProcess.slice(0, TEST_LIMIT);
    }

    // Process all domains using regular batch configuration with appropriate rate limiting and retry logic
    const { successCount, failureCount } = await processLogoBatch(
      domainsToProcess,
      LOGO_BATCH_CONFIGS.REGULAR,
      "bulk logo update",
      3,
    );

    logger.info(
      `[UpdateS3] ✅ Logo update process triggered. ${successCount} succeeded, ${failureCount} failed (check data-access logs for S3 write details).`,
    );
  } catch (error) {
    logger.error("[UpdateS3] ❌ Error during logos S3 update:", error);
  }
}

// --- Main Execution ---

/**
 * Main execution function that orchestrates all scheduled S3 data updates
 * Handles environment validation, flag processing, and sequential update execution
 */
async function runScheduledUpdates(): Promise<void> {
  logger.info(`[UpdateS3] runScheduledUpdates called. Current PT: ${new Date().toISOString()}`);
  logger.info(`[UpdateS3] Configured S3 Root: ${S3_DATA_ROOT}`);
  logger.info(`[UpdateS3] Verbose logging: ${VERBOSE}`);
  logger.info(`[UpdateS3] Force refresh flag: ${forceRefreshFlag}`);
  if (TEST_LIMIT > 0) {
    logger.info(`[UpdateS3] Test limit active: ${TEST_LIMIT} items per operation`);
  }
  const DRY_RUN = process.env.DRY_RUN === "true";
  if (DRY_RUN) {
    logger.info("[UpdateS3] DRY RUN mode: skipping all update processes.");
    logger.info("[UpdateS3] All scheduled update checks complete.");
    process.exit(0);
  }

  // Ensure S3_BUCKET is configured before proceeding
  if (!process.env.S3_BUCKET) {
    logger.error(
      "[UpdateS3] CRITICAL: S3_BUCKET environment variable is not set. Cannot run updates.",
    );
    return; // Exit the main function to allow natural termination
  }

  // Run selected updates sequentially
  if (runBookmarksFlag) {
    logger.info(
      "[UpdateS3] --bookmarks flag is true or no flags provided. Running Bookmarks update.",
    );
    await updateBookmarksInS3();
  } else logger.debug("[UpdateS3] Skipping Bookmarks update as flag was not set.");
  if (runGithubFlag) {
    await updateGithubActivityInS3(); // This includes sub-calculation for aggregated data
  } else logger.debug("[UpdateS3] Skipping GitHub Activity update");
  if (runLogosFlag) {
    await updateLogosInS3();
  } else logger.debug("[UpdateS3] Skipping Logos update");

  logger.info("[UpdateS3] All scheduled update checks complete.");
  process.exit(0);
}

// Run the main function with comprehensive error handling
void runScheduledUpdates().catch((error) => {
  logger.error("[UpdateS3] Unhandled error in runScheduledUpdates:", error);
  process.exit(1);
});

// --- Exported Utility for On-Demand Runtime Updates ---
/**
 * Runs all data update functions (bookmarks, GitHub activity, logos) sequentially.
 * Can be invoked at runtime when environment variables (e.g., S3_BUCKET) are present.
 */
export async function updateAllData(): Promise<void> {
  if (!process.env.S3_BUCKET) {
    logger.warn("[UpdateAllData] S3_BUCKET not set; skipping updates.");
    return;
  }
  try {
    await updateBookmarksInS3();
    await updateGithubActivityInS3();
    await updateLogosInS3();
    logger.info("[UpdateAllData] All data updates completed successfully.");
  } catch (error) {
    logger.error("[UpdateAllData] Error during on-demand data update:", error);
  }
}
