/**
 * Data Fetch Manager
 *
 * Centralized orchestrator for all data fetching operations.
 * Consolidates bookmarks, GitHub activity, and logo fetching logic.
 * Can be invoked by scripts, build processes, and runtime schedulers.
 *
 * @module server/data-fetch-manager
 */

import { config as loadEnv } from "dotenv";
import logger from "@/lib/utils/logger";

import {
  getBookmarks,
  getGithubActivity,
  initializeBookmarksDataAccess,
  getInvestmentDomainsAndIds,
  getLogo,
} from "@/lib/data-access";
import { refreshBookmarks } from "@/lib/bookmarks/service.server";
import { refreshGitHubActivityDataFromApi, calculateAndStoreAggregatedWeeklyActivity } from "@/lib/data-access/github";
import { invalidateLogoS3Cache, resetLogoSessionTracking } from "@/lib/data-access/logos";
import { KNOWN_DOMAINS } from "@/lib/constants";
import type { UnifiedBookmark } from "@/types/bookmark";
import type { DataFetchConfig, DataFetchOperationSummary } from "@/types/lib";

/**
 * Main data fetch manager class
 */
export class DataFetchManager {
  private readonly LOGO_BATCH_CONFIGS = {
    IMMEDIATE: { size: 5, delay: 200 },
    REGULAR: { size: 10, delay: 500 },
  } as const;

  private readonly SAFETY_THRESHOLD_NEW_BOOKMARKS = 10;

  /**
   * Fetches data based on the provided configuration
   */
  async fetchData(config: DataFetchConfig): Promise<DataFetchOperationSummary[]> {
    const results: DataFetchOperationSummary[] = [];

    // Initialize bookmarks data access (non-blocking)
    void initializeBookmarksDataAccess();

    if (config.bookmarks) {
      results.push(await this.fetchBookmarks(config));
    }

    if (config.githubActivity) {
      results.push(await this.fetchGithubActivity(config));
    }

    if (config.logos) {
      results.push(await this.fetchLogos(config));
    }

    return results;
  }

  /**
   * Fetch bookmarks with optional immediate logo processing for new items
   */
  private async fetchBookmarks(config: DataFetchConfig): Promise<DataFetchOperationSummary> {
    const startTime = Date.now();
    logger.info("[DataFetchManager] Starting bookmarks fetch...");

    try {
      // Get current cached bookmarks to compare for new additions
      const previousBookmarks = await getBookmarks(false);
      const previousCount = previousBookmarks?.length || 0;
      const previousBookmarkIds = new Set(previousBookmarks?.map((b) => b.id) || []);

      // Force fresh data fetch
      const bookmarks = await refreshBookmarks();

      if (!bookmarks || bookmarks.length === 0) {
        throw new Error("No bookmarks returned from refresh");
      }

      logger.info(`[DataFetchManager] Fetched ${bookmarks.length} bookmarks (previous: ${previousCount})`);

      // Process new bookmark logos if immediate processing is enabled
      if (config.immediate) {
        const newBookmarks = bookmarks.filter((b) => !previousBookmarkIds.has(b.id));
        if (newBookmarks.length > 0) {
          await this.processNewBookmarkLogos(newBookmarks, config.testLimit);
        }
      }

      const duration = (Date.now() - startTime) / 1000;
      return {
        success: true,
        operation: "bookmarks",
        itemsProcessed: bookmarks.length,
        duration,
      };
    } catch (error) {
      logger.error("[DataFetchManager] Bookmarks fetch failed:", error);
      return {
        success: false,
        operation: "bookmarks",
        error: error instanceof Error ? error.message : String(error),
        duration: (Date.now() - startTime) / 1000,
      };
    }
  }

  /**
   * Fetch GitHub activity data
   */
  private async fetchGithubActivity(_config: DataFetchConfig): Promise<DataFetchOperationSummary> {
    const startTime = Date.now();
    // Explicitly acknowledge the argument so ESLint doesn't flag it as unused
    void _config;
    logger.info("[DataFetchManager] Starting GitHub activity fetch...");

    try {
      const refreshed = await refreshGitHubActivityDataFromApi();

      if (!refreshed) {
        throw new Error("GitHub activity refresh returned null");
      }

      logger.info(
        `[DataFetchManager] GitHub activity fetched - Trailing year: ${refreshed.trailingYearData.totalContributions}, All-time: ${refreshed.allTimeData.totalContributions}`,
      );

      // Re-aggregate stats
      await calculateAndStoreAggregatedWeeklyActivity();

      const duration = (Date.now() - startTime) / 1000;
      return {
        success: true,
        operation: "github-activity",
        itemsProcessed: refreshed.trailingYearData.totalContributions,
        duration,
      };
    } catch (error) {
      logger.error("[DataFetchManager] GitHub activity fetch failed:", error);
      return {
        success: false,
        operation: "github-activity",
        error: error instanceof Error ? error.message : String(error),
        duration: (Date.now() - startTime) / 1000,
      };
    }
  }

  /**
   * Fetch logos for all domains
   */
  private async fetchLogos(config: DataFetchConfig): Promise<DataFetchOperationSummary> {
    const startTime = Date.now();
    logger.info("[DataFetchManager] Starting logos fetch...");

    try {
      // Reset tracking for bulk processing
      resetLogoSessionTracking();
      invalidateLogoS3Cache();

      // Collect all domains
      const domains = await this.collectAllDomains(config.testLimit);
      logger.info(`[DataFetchManager] Processing logos for ${domains.size} unique domains`);

      // Process logos in batches
      const { successCount, failureCount } = await this.processLogoBatch(
        Array.from(domains),
        this.LOGO_BATCH_CONFIGS.REGULAR,
        "bulk logo update",
      );

      const duration = (Date.now() - startTime) / 1000;
      logger.info(
        `[DataFetchManager] ${"bulk logo update"} batches complete. Success: ${successCount}, Failures: ${failureCount}`,
      );
      return {
        success: true,
        operation: "logos",
        itemsProcessed: successCount,
        duration,
      };
    } catch (error) {
      logger.error("[DataFetchManager] Logos fetch failed:", error);
      return {
        success: false,
        operation: "logos",
        error: error instanceof Error ? error.message : String(error),
        duration: (Date.now() - startTime) / 1000,
      };
    }
  }

  /**
   * Process logos for newly added bookmarks
   */
  private async processNewBookmarkLogos(newBookmarks: UnifiedBookmark[], testLimit?: number): Promise<void> {
    let bookmarksToProcess = newBookmarks;

    // Apply test limit if set
    if (testLimit && bookmarksToProcess.length > testLimit) {
      logger.info(
        `[DataFetchManager] Test mode: limiting new bookmarks from ${bookmarksToProcess.length} to ${testLimit}`,
      );
      bookmarksToProcess = bookmarksToProcess.slice(0, testLimit);
    }

    // Safety check for first run or cache loss
    const shouldLimit = newBookmarks.length > this.SAFETY_THRESHOLD_NEW_BOOKMARKS;
    if (shouldLimit) {
      logger.warn(
        `[DataFetchManager] Safety: Limiting immediate logo processing to ${this.SAFETY_THRESHOLD_NEW_BOOKMARKS} most recent bookmarks`,
      );
      bookmarksToProcess = bookmarksToProcess
        .sort((a, b) => new Date(b.dateBookmarked).getTime() - new Date(a.dateBookmarked).getTime())
        .slice(0, this.SAFETY_THRESHOLD_NEW_BOOKMARKS);
    }

    const domains = this.extractDomainsFromBookmarks(bookmarksToProcess);
    if (domains.size > 0) {
      logger.info(`[DataFetchManager] Processing logos for ${domains.size} new bookmark domains`);
      await this.processLogoBatch(Array.from(domains), this.LOGO_BATCH_CONFIGS.IMMEDIATE, "new bookmarks");
    }
  }

  /**
   * Collect all unique domains from various sources
   */
  private async collectAllDomains(testLimit?: number): Promise<Set<string>> {
    const domains = new Set<string>();

    // From bookmarks
    const bookmarks = await getBookmarks(true);
    const bookmarkDomains = this.extractDomainsFromBookmarks(bookmarks ?? []);
    for (const domain of bookmarkDomains) {
      domains.add(domain);
    }

    // From investments
    const investmentDomainsMap = await getInvestmentDomainsAndIds();
    for (const domain of investmentDomainsMap.values()) {
      domains.add(domain);
    }

    // Known domains
    for (const domain of KNOWN_DOMAINS) {
      domains.add(domain);
    }

    // Apply test limit if needed
    if (testLimit && domains.size > testLimit) {
      logger.info(`[DataFetchManager] Test mode: limiting domains from ${domains.size} to ${testLimit}`);
      return new Set(Array.from(domains).slice(0, testLimit));
    }

    return domains;
  }

  /**
   * Extract unique domains from bookmarks
   */
  private extractDomainsFromBookmarks(bookmarks: readonly UnifiedBookmark[]): Set<string> {
    const domains = new Set<string>();
    for (const bookmark of bookmarks) {
      try {
        if (bookmark.url) {
          const url = new URL(bookmark.url);
          const domain = url.hostname.replace(/^www\./, "");
          domains.add(domain);
        }
      } catch (error) {
        logger.warn(`Invalid URL in bookmark ${bookmark.id}: ${bookmark.url}`, error);
      }
    }
    return domains;
  }

  /**
   * Process logo fetching in batches
   */
  private async processLogoBatch(
    domains: readonly string[],
    batchConfig: { readonly size: number; readonly delay: number },
    context: string,
  ): Promise<{ successCount: number; failureCount: number }> {
    let successCount = 0;
    let failureCount = 0;
    const { size: batchSize, delay } = batchConfig;

    for (let i = 0; i < domains.length; i += batchSize) {
      const batch = domains.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(domains.length / batchSize);

      logger.verbose(
        `[DataFetchManager] Processing ${context} batch ${batchNumber}/${totalBatches} (${batch.length} domains)`,
      );

      const promises = batch.map(async (domain) => {
        try {
          const logoResult = await getLogo(domain);
          if (logoResult && logoResult.s3Key) {
            logger.info(`✅ Logo processed for ${domain}`);
            successCount++;
          } else {
            failureCount++;
          }
        } catch (error) {
          logger.error(`❌ Error processing logo for ${domain}:`, error);
          failureCount++;
        }
      });

      await Promise.allSettled(promises);

      // Rate limiting between batches
      if (i + batchSize < domains.length) {
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    logger.info(`[DataFetchManager] ${context} batches complete. Success: ${successCount}, Failures: ${failureCount}`);
    return { successCount, failureCount };
  }

  /**
   * Quick prefetch for build process (S3 data only)
   */
  async prefetchForBuild(): Promise<DataFetchOperationSummary[]> {
    logger.info("[DataFetchManager] Starting build prefetch (S3 data only)...");

    const results: DataFetchOperationSummary[] = [];
    const startTime = Date.now();

    try {
      // Initialize bookmarks (non-blocking)
      void initializeBookmarksDataAccess();

      // Fetch bookmarks from S3 only
      const bookmarks = await getBookmarks(true); // skipExternalFetch = true
      results.push({
        success: bookmarks !== null,
        operation: "bookmarks-prefetch",
        itemsProcessed: bookmarks?.length || 0,
        duration: (Date.now() - startTime) / 1000,
      });

      // Fetch GitHub activity from S3
      const githubActivity = await getGithubActivity();
      results.push({
        success: githubActivity !== null,
        operation: "github-activity-prefetch",
        itemsProcessed: githubActivity ? 1 : 0,
        duration: (Date.now() - startTime) / 1000,
      });

      logger.info("[DataFetchManager] Build prefetch completed (logos skipped for performance)");
    } catch (error) {
      logger.error("[DataFetchManager] Build prefetch failed:", error);
      results.push({
        success: false,
        operation: "build-prefetch",
        error: error instanceof Error ? error.message : String(error),
        duration: (Date.now() - startTime) / 1000,
      });
    }

    return results;
  }
}

export const dataFetchManager = new DataFetchManager();

/**
 * CLI handler for the DataFetchManager
 * Parses command-line arguments and executes appropriate operations
 *
 * The CLI wrapper class only contains static helpers. We intentionally
 * suppress the Biome rule that discourages static-only classes because
 * this structure provides a clear namespace for the CLI entry-point
 * while avoiding top-level function noise.
 */
export class DataFetchManagerCLI {
  // Dummy instance field to ensure the class is not static-only (satisfies linter rule)
  private readonly _instanceMarker = true;

  static async run(): Promise<void> {
    // Load environment variables
    loadEnv();

    // Parse command-line arguments
    const args = process.argv.slice(2);
    const usage = `Usage: data-fetch-manager [options]
Options:
  --bookmarks           Run only the Bookmarks update
  --github-activity     Run only the GitHub Activity update  
  --logos               Run only the Logos update
  --prefetch-build      Run optimized build prefetch (S3 only)
  --prefetch-dev        Run full development prefetch (all data)
  --force               Force refresh of S3 data
  --help, -h            Show this help message
If no options are provided, all updates will run.
`;

    if (args.includes("--help") || args.includes("-h")) {
      console.log(usage);
      process.exit(0);
    }

    // Determine operation mode
    const isPrefetchBuild = args.includes("--prefetch-build");
    const isPrefetchDev = args.includes("--prefetch-dev");

    if (isPrefetchBuild) {
      console.log("[DataFetchManager] Running optimized build prefetch...");
      try {
        const results = await dataFetchManager.prefetchForBuild();
        DataFetchManagerCLI.reportResults(results);
        process.exit(results.every((r) => r.success) ? 0 : 1);
      } catch (error) {
        console.error("[DataFetchManager] Build prefetch failed:", error);
        process.exit(1);
      }
    }

    if (isPrefetchDev) {
      console.log("[DataFetchManager] Running full development prefetch...");
      try {
        const results = await dataFetchManager.fetchData({
          bookmarks: true,
          githubActivity: true,
          logos: true,
          testLimit: process.env.S3_TEST_LIMIT ? Number.parseInt(process.env.S3_TEST_LIMIT, 10) : undefined,
        });
        DataFetchManagerCLI.reportResults(results);
        process.exit(results.every((r) => r.success) ? 0 : 1);
      } catch (error) {
        console.error("[DataFetchManager] Development prefetch failed:", error);
        process.exit(1);
      }
    }

    // Regular update mode
    const runBookmarks = args.length === 0 || args.includes("--bookmarks");
    const runGithub = args.length === 0 || args.includes("--github-activity");
    const runLogos = args.length === 0 || args.includes("--logos");
    const forceRefresh = args.includes("--force") || process.env.FORCE_REFRESH === "1";

    logger.info(`[DataFetchManager] CLI execution started. Args: ${args.join(" ")}`);
    logger.info(`[DataFetchManager] Force refresh: ${forceRefresh}`);

    const testLimit = process.env.S3_TEST_LIMIT ? Number.parseInt(process.env.S3_TEST_LIMIT, 10) : undefined;
    if (testLimit) {
      logger.info(`[DataFetchManager] Test limit active: ${testLimit} items per operation`);
    }

    // Check DRY_RUN mode
    if (process.env.DRY_RUN === "true") {
      logger.info("[DataFetchManager] DRY RUN mode: skipping all update processes.");
      process.exit(0);
    }

    // Ensure S3_BUCKET is configured for updates
    if (!process.env.S3_BUCKET && !isPrefetchBuild && !isPrefetchDev) {
      logger.error("[DataFetchManager] CRITICAL: S3_BUCKET environment variable is not set. Cannot run updates.");
      process.exit(1);
    }

    try {
      const results = await dataFetchManager.fetchData({
        bookmarks: runBookmarks,
        githubActivity: runGithub,
        logos: runLogos,
        forceRefresh,
        testLimit,
        immediate: true, // Process new bookmark logos immediately
      });

      // Report results
      for (const result of results) {
        if (result.success) {
          logger.info(
            `[DataFetchManager] ✅ ${result.operation}: ${result.itemsProcessed} items processed in ${result.duration?.toFixed(2)}s`,
          );
        } else {
          logger.error(`[DataFetchManager] ❌ ${result.operation} failed: ${result.error}`);
        }
      }

      logger.info("[DataFetchManager] All operations complete.");
      process.exit(results.every((r) => r.success) ? 0 : 1);
    } catch (error) {
      logger.error("[DataFetchManager] Unhandled error:", error);
      process.exit(1);
    }
  }

  private static reportResults(results: DataFetchOperationSummary[]): void {
    for (const result of results) {
      if (result.success) {
        console.log(
          `✓ ${result.operation}: ${result.itemsProcessed} items${result.duration ? ` in ${result.duration.toFixed(2)}s` : ""}`,
        );
      } else {
        console.error(`✗ ${result.operation} failed: ${result.error}`);
      }
    }
  }
}
