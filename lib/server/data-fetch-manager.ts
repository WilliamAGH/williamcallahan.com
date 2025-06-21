/**
 * Data Fetch Manager
 *
 * Centralized orchestrator for all data fetching operations.
 * Consolidates bookmarks, GitHub activity, and logo fetching logic.
 * Can be invoked by scripts, build processes, and runtime schedulers.
 *
 * @module server/data-fetch-manager
 */

import * as dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import logger from "@/lib/utils/logger";
import { getBookmarks } from "@/lib/bookmarks/bookmarks-data-access.server";
import { getInvestmentDomainsAndIds } from "@/lib/data-access/investments";
import { KNOWN_DOMAINS } from "@/lib/constants";
import { getLogo } from "@/lib/data-access/logos";
import { refreshBookmarks } from "@/lib/bookmarks/service.server";
import type { UnifiedBookmark } from "@/types/bookmark";
import type { DataFetchConfig, DataFetchOperationSummary } from "@/types/lib";

// Custom environment loader to handle multi-line keys that break dotenv
try {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const envFileContent = fs.readFileSync(envPath, { encoding: "utf-8" });
    const lines = envFileContent.split("\n");
    const cleanLines: string[] = [];
    let privateKeyVal = "";

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith("GOOGLE_SEARCH_INDEXING_SA_PRIVATE_KEY=")) {
        let value = trimmedLine.substring("GOOGLE_SEARCH_INDEXING_SA_PRIVATE_KEY=".length);
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }
        privateKeyVal = value;
      } else {
        cleanLines.push(line);
      }
    }

    const envConfig = dotenv.parse(cleanLines.join("\n"));
    for (const k in envConfig) {
      if (!Object.hasOwn(process.env, k)) {
        process.env[k] = envConfig[k];
      }
    }
    if (privateKeyVal && !process.env.GOOGLE_SEARCH_INDEXING_SA_PRIVATE_KEY) {
      process.env.GOOGLE_SEARCH_INDEXING_SA_PRIVATE_KEY = privateKeyVal;
    }
  }
} catch (error) {
  logger.error("Failed to load or parse .env file:", error);
}

import {
  calculateAndStoreAggregatedWeeklyActivity,
  initializeBookmarksDataAccess,
  invalidateLogoS3Cache,
  refreshGitHubActivityDataFromApi,
  resetLogoSessionTracking,
} from "@/lib/data-access";

/**
 * Main data fetch manager class
 */
export class DataFetchManager {
  /**
   * Configuration for logo batch processing
   */
  private readonly LOGO_BATCH_CONFIGS = {
    IMMEDIATE: { size: 5, delay: 200 },
    REGULAR: { size: 10, delay: 500 },
  } as const;

  /**
   * Safety threshold for new bookmarks processing
   */
  private readonly SAFETY_THRESHOLD_NEW_BOOKMARKS = 10;

  /**
   * Fetches data based on the provided configuration
   * @param config - Configuration specifying which data to fetch
   * @returns Promise resolving to array of operation summaries
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
   * @param config - Configuration for bookmark fetching
   * @returns Promise resolving to operation summary
   */
  private async fetchBookmarks(config: DataFetchConfig): Promise<DataFetchOperationSummary> {
    const startTime = Date.now();
    logger.info("[DataFetchManager] Starting bookmarks fetch...");

    try {
      // Get current cached bookmarks to compare for new additions
      const previousBookmarks: UnifiedBookmark[] = await getBookmarks(false);
      const previousCount = previousBookmarks.length;
      const previousBookmarkIds = new Set(previousBookmarks.map((b: UnifiedBookmark) => b.id));

      // Force fresh data fetch
      const bookmarksResult = await refreshBookmarks();
      if (!bookmarksResult) {
        throw new Error("No bookmarks returned from refresh");
      }

      const bookmarks: UnifiedBookmark[] = bookmarksResult;
      if (bookmarks.length === 0) {
        throw new Error("Empty bookmarks array returned from refresh");
      }

      logger.info(`[DataFetchManager] Fetched ${bookmarks.length} bookmarks (previous: ${previousCount})`);

      // Process new bookmark logos if immediate processing is enabled
      if (config.immediate) {
        const newBookmarks = bookmarks.filter((b: UnifiedBookmark) => !previousBookmarkIds.has(b.id));
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
    } catch (e: unknown) {
      const error = e instanceof Error ? e : new Error(String(e));
      logger.error("[DataFetchManager] Bookmarks fetch failed:", error);
      return {
        success: false,
        operation: "bookmarks",
        error: error.message,
        duration: (Date.now() - startTime) / 1000,
      };
    }
  }

  /**
   * Fetch GitHub activity data
   * @param _config - Configuration (acknowledged but unused)
   * @returns Promise resolving to operation summary
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
    } catch (e: unknown) {
      const error = e instanceof Error ? e : new Error(String(e));
      logger.error("[DataFetchManager] GitHub activity fetch failed:", error);
      return {
        success: false,
        operation: "github-activity",
        error: error.message,
        duration: (Date.now() - startTime) / 1000,
      };
    }
  }

  /**
   * Fetch logos for all domains
   * @param config - Configuration for logo fetching
   * @returns Promise resolving to operation summary
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
    } catch (e: unknown) {
      const error = e instanceof Error ? e : new Error(String(e));
      logger.error("[DataFetchManager] Logos fetch failed:", error);
      return {
        success: false,
        operation: "logos",
        error: error.message,
        duration: (Date.now() - startTime) / 1000,
      };
    }
  }

  /**
   * Process logos for newly added bookmarks
   * @param newBookmarks - Array of newly added bookmark objects
   * @param testLimit - Optional limit for testing purposes
   * @returns Promise that resolves when processing is complete
   */
  private async processNewBookmarkLogos(newBookmarks: UnifiedBookmark[], testLimit?: number): Promise<void> {
    let bookmarksToProcess = newBookmarks;

    const newBookmarkCount = newBookmarks.length;
    logger.info(`[DataFetchManager] Processing logos for ${newBookmarkCount} new bookmarks`);

    // Safety check for excessive new bookmarks
    if (newBookmarkCount > this.SAFETY_THRESHOLD_NEW_BOOKMARKS) {
      logger.warn(
        `[DataFetchManager] New bookmark count (${newBookmarkCount}) exceeds safety threshold (${this.SAFETY_THRESHOLD_NEW_BOOKMARKS}). Processing logos may be throttled.`,
      );
    }

    // Apply test limit if provided
    if (typeof testLimit === "number" && testLimit > 0) {
      bookmarksToProcess = newBookmarks.slice(0, testLimit);
      logger.info(`[DataFetchManager] Applying test limit, processing ${bookmarksToProcess.length} bookmarks`);
    }

    const domains = this.extractDomainsFromBookmarks(bookmarksToProcess);
    logger.info(`[DataFetchManager] Found ${domains.size} unique domains from new bookmarks`);

    const { successCount, failureCount } = await this.processLogoBatch(
      Array.from(domains),
      this.LOGO_BATCH_CONFIGS.IMMEDIATE,
      "new bookmark logo update",
    );
    logger.info(
      `[DataFetchManager] ${"new bookmark logo update"} batches complete. Success: ${successCount}, Failures: ${failureCount}`,
    );
  }

  /**
   * Collects all unique domains from bookmarks and investments
   * @param testLimit - Optional limit for testing purposes
   * @returns Promise resolving to a Set of unique domain strings
   */
  private async collectAllDomains(testLimit?: number): Promise<Set<string>> {
    const domains = new Set<string>();

    try {
      // Get investment domains
      const investmentData = await getInvestmentDomainsAndIds();
      for (const [domain] of investmentData) {
        domains.add(domain);
      }

      // Get bookmark domains
      const bookmarks = await getBookmarks(false);
      const bookmarkDomains = this.extractDomainsFromBookmarks(bookmarks);
      for (const domain of bookmarkDomains) {
        if (domain) {
          domains.add(domain);
        }
      }

      // Add known domains
      for (const domain of KNOWN_DOMAINS) {
        domains.add(domain);
      }
    } catch (error) {
      logger.error("[DataFetchManager] Error collecting domains:", error);
    }

    if (testLimit) {
      return new Set(Array.from(domains).slice(0, testLimit));
    }
    return domains;
  }

  /**
   * Extracts domains from a list of bookmarks
   * @param bookmarks - Array of bookmark objects to extract domains from
   * @returns Set of unique domain strings
   */
  private extractDomainsFromBookmarks(bookmarks: readonly UnifiedBookmark[]): Set<string> {
    const domains = new Set<string>();
    for (const bookmark of bookmarks) {
      if (bookmark.url) {
        try {
          const { domain } = bookmark;
          if (domain) {
            domains.add(domain);
          }
        } catch {
          logger.warn(`[DataFetchManager] Could not parse domain from URL: ${bookmark.url}`);
        }
      }
    }
    return domains;
  }

  /**
   * Processes a list of domains to fetch logos in batches
   * @param domains - Array of domain strings to process
   * @param batchConfig - Configuration for batch processing (size and delay)
   * @param context - Context string for logging purposes
   * @returns Promise resolving to success and failure counts
   */
  private async processLogoBatch(
    domains: readonly string[],
    batchConfig: { readonly size: number; readonly delay: number },
    context: string,
  ): Promise<{ successCount: number; failureCount: number }> {
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < domains.length; i += batchConfig.size) {
      const batch = domains.slice(i, i + batchConfig.size);
      logger.info(
        `[DataFetchManager] [${context}] Processing batch ${i / batchConfig.size + 1} of ${Math.ceil(
          domains.length / batchConfig.size,
        )} (size: ${batch.length})`,
      );

      const promises = batch.map((domain) =>
        getLogo(domain)
          .then((result) => {
            if (result && !result.error) {
              successCount++;
            } else {
              failureCount++;
            }
          })
          .catch(() => {
            failureCount++;
          }),
      );

      await Promise.all(promises);

      if (i + batchConfig.size < domains.length) {
        await new Promise((resolve) => setTimeout(resolve, batchConfig.delay));
      }
    }

    logger.info(
      `[DataFetchManager] [${context}] Batches complete. Success: ${successCount}, Failures: ${failureCount}`,
    );
    return { successCount, failureCount };
  }

  /**
   * Prefetches essential data for the build process.
   * @returns Promise resolving to array of operation summaries
   */
  async prefetchForBuild(): Promise<DataFetchOperationSummary[]> {
    logger.info("[DataFetchManager] Starting prefetch for build...");
    const results = await this.fetchData({
      bookmarks: true,
      githubActivity: true,
      logos: false, // Logos are not pre-fetched for build
      immediate: false,
    });
    logger.info("[DataFetchManager] Prefetch for build completed.");
    return results;
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
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
        logger.info(`[DataFetchManagerCLI] Applying test limit of ${limit}`);
      }
    }
  }

  manager
    .fetchData(config)
    .then((results) => {
      logger.info("[DataFetchManagerCLI] All tasks complete.");
      results.forEach((result) => {
        if (result.success) {
          logger.info(`  - ${result.operation}: Success (${result.itemsProcessed} items)`);
        } else {
          logger.error(`  - ${result.operation}: Failed (${result.error})`);
        }
      });
    })
    .catch((error: unknown) => {
      logger.error("[DataFetchManagerCLI] An unexpected error occurred:", error);
      process.exit(1);
    });
}
