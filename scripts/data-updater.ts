#!/usr/bin/env bun

/**
 * Data Updater CLI
 *
 * Thin CLI wrapper for DataFetchManager operations.
 * Handles all data update operations including S3 updates and prefetching.
 */

import { DataFetchManager } from "@/lib/server/data-fetch-manager";
import logger from "@/lib/utils/logger";

const args = process.argv.slice(2);

// Handle help flag
if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: data-fetch-manager [options]

Options:
  --bookmarks          Fetch and update bookmarks data
  --github             Fetch and update GitHub activity data  
  --logos              Fetch and update logos for all domains
  --force              Force refresh of all data
  --testLimit=N        Limit operations to N items for testing
  --help, -h           Show this help message

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

const config: {
  fetchLogos?: boolean;
  fetchGithub?: boolean;
  forceRefresh?: boolean;
  testLimit?: number;
} = {};

if (args.includes("--logos")) {
  config.fetchLogos = true;
}
if (args.includes("--github")) {
  config.fetchGithub = true;
}
if (args.includes("--force")) {
  config.forceRefresh = true;
}

const testLimitArg = args.find((arg) => arg.startsWith("--testLimit="));
if (testLimitArg) {
  const limitStr = testLimitArg.split("=")[1];
  if (limitStr) {
    const limit = parseInt(limitStr, 10);
    if (!Number.isNaN(limit)) {
      config.testLimit = limit;
      logger.info(`[DataUpdaterCLI] Applying test limit of ${limit}`);
    }
  }
}

manager
  .fetchData(config)
  .then((results) => {
    logger.info("[DataUpdaterCLI] All tasks complete.");
    results.forEach((result) => {
      if (result.success) {
        logger.info(`  - ${result.operation}: Success (${result.itemsProcessed} items)`);
      } else {
        logger.error(`  - ${result.operation}: Failed (${result.error})`);
      }
    });

    // Explicitly exit to prevent hanging due to active timers/intervals
    process.exit(0);
  })
  .catch((error: unknown) => {
    logger.error("[DataUpdaterCLI] An unexpected error occurred:", error);
    process.exit(1);
  });
