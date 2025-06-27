#!/usr/bin/env bun

/**
 * Data Updater CLI
 *
 * Thin CLI wrapper for DataFetchManager operations.
 * Handles all data update operations including S3 updates and prefetching.
 */

import { DataFetchManager } from "@/lib/server/data-fetch-manager";
import type { DataFetchConfig } from "@/types/lib";
import logger from "@/lib/utils/logger";
import { existsSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

// Set flag to indicate this is the data updater process
process.env.IS_DATA_UPDATER = "true";

const args = process.argv.slice(2);

// 12-hour check for dev environment
const LAST_RUN_SUCCESS_FILE = join(process.cwd(), ".populate-volumes-last-run-success");
const RUN_INTERVAL_HOURS = 12;

async function checkRecentRun(): Promise<boolean> {
  // Only check in development mode and when not forced
  if (process.env.NODE_ENV !== "development" || args.includes("--force")) {
    return false; // Continue with update
  }

  // Skip check if specific operations are requested (not the default all operations)
  if (args.includes("--bookmarks") || args.includes("--github") || args.includes("--logos") || args.includes("--search-indexes")) {
    return false; // Continue with update
  }

  if (!existsSync(LAST_RUN_SUCCESS_FILE)) {
    return false; // Continue with update
  }

  try {
    const stats = statSync(LAST_RUN_SUCCESS_FILE);
    const hoursSinceLastRun = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
    
    if (hoursSinceLastRun < RUN_INTERVAL_HOURS) {
      console.log(`✅ Data updated within the last ${RUN_INTERVAL_HOURS} hours (${hoursSinceLastRun.toFixed(2)}h ago). Skipping update.`);
      return true; // Skip update
    }
  } catch (error) {
    logger.warn("Error checking last run timestamp:", error);
  }
  
  return false; // Continue with update
}

async function updateTimestamp(): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    try {
      await writeFile(LAST_RUN_SUCCESS_FILE, new Date().toISOString());
    } catch (error) {
      logger.warn("Error updating timestamp:", error);
    }
  }
}

// Handle help flag
if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: data-fetch-manager [options]

Options:
  --bookmarks          Fetch and update bookmarks data
  --github             Fetch and update GitHub activity data  
  --logos              Fetch and update logos for all domains
  --search-indexes     Build and update search indexes
  --force              Force refresh of all data
  --testLimit=N        Limit operations to N items for testing
  --help, -h           Show this help message

If no options are specified, all operations will run (bookmarks, github, logos, search-indexes).

Environment Variables:
  DRY_RUN=true         Skip all update processes (dry run mode)
  S3_BUCKET            S3 bucket name for data storage
  S3_TEST_LIMIT        Test limit for S3 operations`);
  process.exit(0);
}

logger.info(`[DataFetchManager] CLI execution started. Args: ${args.join(" ")}`);

// Handle dry-run mode
if (process.env.DRY_RUN === "true") {
  console.log("DRY RUN mode - skipping all update processes");
  logger.info(`Args: ${args.join(" ")}`);

  // Handle test limit environment variable for dry-run logging
  if (process.env.S3_TEST_LIMIT) {
    console.log(`Test limit active: ${process.env.S3_TEST_LIMIT} items per operation`);
  }

  process.exit(0);
}

const manager = new DataFetchManager();

const config: DataFetchConfig = {};

// Check if any specific operations were requested
const hasSpecificOperation = args.includes("--bookmarks") || 
                           args.includes("--logos") || 
                           args.includes("--github") || 
                           args.includes("--search-indexes");

// If no specific operations, run all
if (!hasSpecificOperation) {
  config.bookmarks = true;
  config.logos = true;
  config.githubActivity = true;
  config.searchIndexes = true;
} else {
  // Otherwise only run what was requested
  if (args.includes("--bookmarks")) {
    config.bookmarks = true;
  }
  if (args.includes("--logos")) {
    config.logos = true;
  }
  if (args.includes("--github")) {
    config.githubActivity = true;
  }
  if (args.includes("--search-indexes")) {
    config.searchIndexes = true;
  }
}

if (args.includes("--force")) {
  config.forceRefresh = true;
}

const testLimitArg = args.find((arg) => arg.startsWith("--testLimit="));
if (testLimitArg) {
  const limitStr = testLimitArg.split("=")[1];
  if (limitStr?.trim()) {
    const limit = parseInt(limitStr, 10);
    if (!Number.isNaN(limit) && limit > 0 && limit <= 10000) {
      config.testLimit = limit;
      logger.info(`[DataUpdaterCLI] Applying test limit of ${limit}`);
    } else {
      logger.error(`[DataUpdaterCLI] Invalid test limit: ${limitStr}. Must be a positive integer <= 10000`);
      process.exit(1);
    }
  }
}

// Main execution
(async () => {
  // Check if we should skip due to recent run
  const shouldSkip = await checkRecentRun();
  if (shouldSkip) {
    process.exit(0);
  }

  // Execute data fetch
  try {
    const results = await manager.fetchData(config);
    
    logger.info("[DataUpdaterCLI] All tasks complete.");
    
    let hasSuccess = false;
    results.forEach((result) => {
      if (result.success) {
        logger.info(`  - ${result.operation}: Success (${result.itemsProcessed} items)`);
        hasSuccess = true;
      } else {
        logger.error(`  - ${result.operation}: Failed (${result.error})`);
      }
    });

    // Update timestamp if any operation succeeded
    if (hasSuccess) {
      await updateTimestamp();
    }

    // Explicitly exit to prevent hanging due to active timers/intervals
    process.exit(0);
  } catch (error: unknown) {
    logger.error("[DataUpdaterCLI] An unexpected error occurred:", error);
    process.exit(1);
  }
})();
