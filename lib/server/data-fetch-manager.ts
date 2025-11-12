/**
 * Data Fetch Manager
 *
 * Centralized orchestrator for all data fetching operations.
 * Consolidates bookmarks, GitHub activity, and logo fetching logic.
 * Can be invoked by scripts, build processes, and runtime schedulers.
 *
 * @module server/data-fetch-manager
 */

import { loadEnvironmentWithMultilineSupport } from "@/lib/utils/env-loader";
loadEnvironmentWithMultilineSupport();

import logger from "@/lib/utils/logger";
import { getMonotonicTime } from "@/lib/utils";
import { getBookmarks } from "@/lib/bookmarks/bookmarks-data-access.server";
import { getInvestmentDomainsAndIds } from "@/lib/data-access/investments";
import { KNOWN_DOMAINS, SEARCH_S3_PATHS, IMAGE_MANIFEST_S3_PATHS, IMAGE_S3_PATHS } from "@/lib/constants";
import { getLogo } from "@/lib/data-access/logos";
import { processLogoBatch } from "@/lib/data-access/logos-batch";
import { refreshBookmarks } from "@/lib/bookmarks/service.server";
import type { UnifiedBookmark } from "@/types/bookmark";
import type { DataFetchConfig, DataFetchOperationSummary } from "@/types/lib";
import { writeJsonS3, listS3Objects } from "@/lib/s3-utils";
import type { LogoManifest } from "@/types/image";

import {
  calculateAndStoreAggregatedWeeklyActivity,
  initializeBookmarksDataAccess,
  invalidateLogoS3Cache,
  refreshGitHubActivityDataFromApi,
  resetLogoSessionTracking,
} from "@/lib/data-access";
// Content graph import moved to lazy loading to reduce startup overhead

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
   * Fetches data based on the provided configuration
   * @param config - Configuration specifying which data to fetch
   * @returns Promise resolving to array of operation summaries
   *
   * CRITICAL DEPENDENCY ORDERING:
   * 1. Bookmarks MUST be fetched first (generates and saves slug mappings)
   * 2. Search indexes depend on slug mappings being available
   * 3. Content graph depends on all content being updated
   *
   * Changing this order can cause race conditions and 404 errors!
   */
  async fetchData(config: DataFetchConfig): Promise<DataFetchOperationSummary[]> {
    const results: DataFetchOperationSummary[] = [];

    // Initialize bookmarks data access (non-blocking)
    void initializeBookmarksDataAccess();

    // STEP 1: Fetch bookmarks first (critical - generates slug mappings)
    if (config.bookmarks) {
      results.push(await this.fetchBookmarks(config));
    }

    // STEP 2: Fetch other primary data sources
    if (config.githubActivity) {
      results.push(await this.fetchGithubActivity(config));
    }

    if (config.logos) {
      results.push(await this.fetchLogos(config));
    }

    // STEP 3: Build search indexes (depends on slug mappings from bookmarks)
    if (config.searchIndexes) {
      results.push(await this.buildSearchIndexes(config));
    }

    // STEP 4: Build image manifests after logo fetching
    if (config.logos || config.forceRefresh) {
      results.push(await this.buildImageManifests(config));
    }

    // STEP 5: Build content graph LAST (depends on all content being updated and slug mappings)
    // The content graph uses slug mappings at runtime for bookmark URLs
    if (config.bookmarks || config.forceRefresh) {
      results.push(await this.runContentGraphBuild(config));
    }

    return results;
  }

  /**
   * Fetch bookmarks with optional immediate logo processing for new items
   * @param config - Configuration for bookmark fetching
   * @returns Promise resolving to operation summary
   */
  private async fetchBookmarks(config: DataFetchConfig): Promise<DataFetchOperationSummary> {
    const startTime = getMonotonicTime();
    logger.info("[DataFetchManager] Starting bookmarks fetch...");

    try {
      // Get current cached bookmarks to compare for new additions
      const previousBookmarks = (await getBookmarks({ skipExternalFetch: false })) as UnifiedBookmark[];
      const previousCount = previousBookmarks.length;
      // const previousBookmarkIds = new Set(previousBookmarks.map((b: UnifiedBookmark) => b.id));

      // Force fresh data fetch, passing the forceRefresh flag
      const bookmarksResult = await refreshBookmarks(config.forceRefresh);
      if (!bookmarksResult) {
        throw new Error("No bookmarks returned from refresh");
      }

      const bookmarks: UnifiedBookmark[] = bookmarksResult;
      if (bookmarks.length === 0) {
        throw new Error("Empty bookmarks array returned from refresh");
      }

      logger.info(`[DataFetchManager] Fetched ${bookmarks.length} bookmarks (previous: ${previousCount})`);

      // DISABLED FOR BOOKMARKS: Don't fetch logos for bookmarks
      // Bookmarks should only use OpenGraph images, not logos/favicons
      // But logos are still needed for investments/experience/education pages
      // if (config.immediate) {
      //   const newBookmarks = bookmarks.filter((b: UnifiedBookmark) => !previousBookmarkIds.has(b.id));
      //   if (newBookmarks.length > 0) {
      //     await this.processNewBookmarkLogos(newBookmarks, config.testLimit);
      //   }
      // }

      // Read current index to surface changeDetected/lastFetchedAt consistently
      let changeDetected: boolean | undefined;
      let lastFetchedAt: number | undefined;
      try {
        const { readJsonS3 } = await import("@/lib/s3-utils");
        const { BOOKMARKS_S3_PATHS } = await import("@/lib/constants");
        const index = await readJsonS3<import("@/types/bookmark").BookmarksIndex>(BOOKMARKS_S3_PATHS.INDEX);
        if (index) {
          changeDetected = index.changeDetected ?? undefined;
          lastFetchedAt = index.lastFetchedAt;
        }
      } catch {
        // non-fatal
      }

      const duration = (getMonotonicTime() - startTime) / 1000;
      return {
        success: true,
        operation: "bookmarks",
        itemsProcessed: bookmarks.length,
        duration,
        changeDetected,
        lastFetchedAt,
      };
    } catch (e: unknown) {
      const error = e instanceof Error ? e : new Error(String(e));
      logger.error("[DataFetchManager] Bookmarks fetch failed:", error);
      return {
        success: false,
        operation: "bookmarks",
        error: error.message,
        duration: (getMonotonicTime() - startTime) / 1000,
      };
    }
  }

  /**
   * Fetch GitHub activity data
   * @param config - Configuration (acknowledged but unused)
   * @returns Promise resolving to operation summary
   */
  private async fetchGithubActivity(config: DataFetchConfig): Promise<DataFetchOperationSummary> {
    const startTime = getMonotonicTime();
    void config; // Explicitly mark as unused per project convention
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

      const duration = (getMonotonicTime() - startTime) / 1000;
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
        duration: (getMonotonicTime() - startTime) / 1000,
      };
    }
  }

  /**
   * Fetch logos for all domains
   * @param config - Configuration for logo fetching
   * @returns Promise resolving to operation summary
   */
  private async fetchLogos(config: DataFetchConfig): Promise<DataFetchOperationSummary> {
    const startTime = getMonotonicTime();
    logger.info("[DataFetchManager] Starting logos fetch...");

    try {
      // Reset tracking for bulk processing
      resetLogoSessionTracking();
      invalidateLogoS3Cache();

      // Collect all domains
      const domains = await this.collectAllDomains(config.testLimit);
      logger.info(`[DataFetchManager] Processing logos for ${domains.size} unique domains`);

      // Use batch mode for logo processing
      const isBatchMode = process.env.IS_DATA_UPDATER === "true";

      if (isBatchMode) {
        // Use simplified batch processing
        const results = await processLogoBatch(Array.from(domains), {
          onProgress: (current, total) => {
            if (current % 50 === 0) {
              logger.info(`[DataFetchManager] Logo batch progress: ${current}/${total}`);
            }
          },
        });

        const successCount = Array.from(results.values()).filter(r => !r.error).length;
        const failureCount = results.size - successCount;

        const duration = (getMonotonicTime() - startTime) / 1000;
        logger.info(`[DataFetchManager] Logo batch complete. Success: ${successCount}, Failures: ${failureCount}`);
        return {
          success: true,
          operation: "logos",
          itemsProcessed: successCount,
          duration,
        };
      } else {
        // Use existing runtime processing
        const { successCount, failureCount } = await this.processLogoBatch(
          Array.from(domains),
          this.LOGO_BATCH_CONFIGS.REGULAR,
          "bulk logo update",
        );

        const duration = (getMonotonicTime() - startTime) / 1000;
        logger.info(
          `[DataFetchManager] ${"bulk logo update"} batches complete. Success: ${successCount}, Failures: ${failureCount}`,
        );
        return {
          success: true,
          operation: "logos",
          itemsProcessed: successCount,
          duration,
        };
      }
    } catch (e: unknown) {
      const error = e instanceof Error ? e : new Error(String(e));
      logger.error("[DataFetchManager] Logos fetch failed:", error);
      return {
        success: false,
        operation: "logos",
        error: error.message,
        duration: (getMonotonicTime() - startTime) / 1000,
      };
    }
  }

  /**
   * Collects all unique domains from bookmarks and investments
   * @param testLimit - Optional limit for testing purposes
   * @returns Promise resolving to a Set of unique domain strings
   */
  private async collectAllDomains(testLimit?: number): Promise<Set<string>> {
    const domains = new Set<string>();

    try {
      // Parallelize data collection for better performance
      const [investmentData, { experiences }, { education, certifications, recentCourses }, bookmarks] =
        await Promise.all([
          getInvestmentDomainsAndIds(),
          import("@/data/experience"),
          import("@/data/education"),
          getBookmarks({
            skipExternalFetch: false,
            includeImageData: false,
          }) as Promise<UnifiedBookmark[]>,
        ]);

      // Process investment domains
      for (const [domain] of investmentData) {
        domains.add(domain);
      }

      // Process experience domains
      for (const exp of experiences) {
        if (exp.website) {
          try {
            const url = new URL(exp.website);
            const domain = url.hostname.replace(/^www\./, "");
            domains.add(domain);
          } catch {
            logger.warn(`[DataFetchManager] Could not parse domain from experience URL: ${exp.website}`);
          }
        }
      }

      // Process education domains
      const allEducation = [...education, ...certifications, ...recentCourses];
      for (const edu of allEducation) {
        if (edu.website) {
          try {
            const url = new URL(edu.website);
            const domain = url.hostname.replace(/^www\./, "");
            domains.add(domain);
          } catch {
            logger.warn(`[DataFetchManager] Could not parse domain from education URL: ${edu.website}`);
          }
        }
      }

      // Process bookmark domains
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

      const promises = batch.map(domain =>
        getLogo(domain)
          .then(result => {
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
        await new Promise(resolve => setTimeout(resolve, batchConfig.delay));
      }
    }

    logger.info(
      `[DataFetchManager] [${context}] Batches complete. Success: ${successCount}, Failures: ${failureCount}`,
    );
    return { successCount, failureCount };
  }

  /**
   * Build and upload search indexes to S3
   * @param _config - Configuration (acknowledged but unused)
   * @returns Promise resolving to operation summary
   */
  private async buildSearchIndexes(config: DataFetchConfig): Promise<DataFetchOperationSummary> {
    const startTime = getMonotonicTime();
    void config; // Explicitly mark as unused per project convention
    logger.info("[DataFetchManager] Starting search index build...");

    try {
      // CRITICAL: Ensure slug mappings are saved before building search indexes
      // This prevents race conditions where search indexes use stale or missing slug mappings
      logger.info("[DataFetchManager] Ensuring slug mappings are up-to-date before building search indexes...");

      const { loadSlugMapping, saveSlugMapping } = await import("@/lib/bookmarks/slug-manager");
      const { getBookmarks } = await import("@/lib/bookmarks/service.server");

      // Check if slug mappings exist and are current
      const existingMapping = await loadSlugMapping();
      if (!existingMapping) {
        logger.warn("[DataFetchManager] No slug mapping found, generating before search index build...");
        const bookmarks = (await getBookmarks({
          skipExternalFetch: false,
          includeImageData: false,
        })) as import("@/types/bookmark").UnifiedBookmark[];
        await saveSlugMapping(bookmarks, true, false);
        logger.info("[DataFetchManager] Slug mapping generated and saved");
      } else {
        logger.info(`[DataFetchManager] Slug mapping exists with ${existingMapping.count} entries`);
      }

      // Dynamically import to avoid loading heavy dependencies unless needed
      const { buildAllSearchIndexes } = await import("@/lib/search/index-builder");

      // Build all search indexes
      const indexes = await buildAllSearchIndexes();

      // Upload each index to S3
      const uploadPromises = [
        writeJsonS3(SEARCH_S3_PATHS.POSTS_INDEX, indexes.posts),
        writeJsonS3(SEARCH_S3_PATHS.INVESTMENTS_INDEX, indexes.investments),
        writeJsonS3(SEARCH_S3_PATHS.EXPERIENCE_INDEX, indexes.experience),
        writeJsonS3(SEARCH_S3_PATHS.EDUCATION_INDEX, indexes.education),
        writeJsonS3(SEARCH_S3_PATHS.BOOKMARKS_INDEX, indexes.bookmarks),
        writeJsonS3(SEARCH_S3_PATHS.BUILD_METADATA, indexes.buildMetadata),
      ];

      await Promise.all(uploadPromises);

      logger.info("[DataFetchManager] Search indexes built and uploaded successfully");

      const duration = (getMonotonicTime() - startTime) / 1000;
      return {
        success: true,
        operation: "searchIndexes",
        itemsProcessed: 6, // Number of indexes uploaded
        duration,
      };
    } catch (e: unknown) {
      const error = e instanceof Error ? e : new Error(String(e));
      logger.error("[DataFetchManager] Search index build failed:", error);
      return {
        success: false,
        operation: "searchIndexes",
        error: error.message,
        duration: (getMonotonicTime() - startTime) / 1000,
      };
    }
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
      searchIndexes: true, // Build search indexes at build time
      immediate: false,
    });
    logger.info("[DataFetchManager] Prefetch for build completed.");
    return results;
  }

  /**
   * Build image manifests by listing available images in S3
   * @param _config - Configuration (acknowledged but unused)
   * @returns Promise resolving to operation summary
   */
  private async buildImageManifests(config: DataFetchConfig): Promise<DataFetchOperationSummary> {
    const startTime = getMonotonicTime();
    void config; // Explicitly mark as unused per project convention
    logger.info("[DataFetchManager] Starting image manifest build...");

    try {
      // List all images in each directory
      const [logos, opengraph, blog] = await Promise.all([
        listS3Objects(IMAGE_S3_PATHS.LOGOS_DIR),
        listS3Objects(IMAGE_S3_PATHS.OPENGRAPH_DIR),
        listS3Objects(IMAGE_S3_PATHS.BLOG_DIR),
      ]);

      // Create manifests with extracted domain/identifier from filenames
      const manifests = {
        logos: this.createLogoManifest(logos),
        opengraph: this.createImageManifest(opengraph),
        blog: this.createImageManifest(blog),
      };

      // Upload manifests to S3
      const uploadPromises = [
        writeJsonS3(IMAGE_MANIFEST_S3_PATHS.LOGOS_MANIFEST, manifests.logos),
        writeJsonS3(IMAGE_MANIFEST_S3_PATHS.OPENGRAPH_MANIFEST, manifests.opengraph),
        writeJsonS3(IMAGE_MANIFEST_S3_PATHS.BLOG_IMAGES_MANIFEST, manifests.blog),
      ];

      await Promise.all(uploadPromises);

      const totalImages = logos.length + opengraph.length + blog.length;
      logger.info(`[DataFetchManager] Image manifests built successfully. Total images: ${totalImages}`);

      const duration = (getMonotonicTime() - startTime) / 1000;
      return {
        success: true,
        operation: "imageManifests",
        itemsProcessed: totalImages,
        duration,
      };
    } catch (e: unknown) {
      const error = e instanceof Error ? e : new Error(String(e));
      logger.error("[DataFetchManager] Image manifest build failed:", error);
      return {
        success: false,
        operation: "imageManifests",
        error: error.message,
        duration: (getMonotonicTime() - startTime) / 1000,
      };
    }
  }

  /**
   * Create logo manifest from S3 keys
   * @param s3Keys - Array of S3 keys for logos
   * @returns Manifest object mapping domains to logo info
   */
  private createLogoManifest(s3Keys: string[]): LogoManifest {
    const manifest: LogoManifest = {};
    const cdnBase = process.env.S3_CDN_URL || process.env.NEXT_PUBLIC_S3_CDN_URL || "";

    for (const key of s3Keys) {
      // Detect inverted logos
      const isInverted = key.includes("/inverted/");

      const filename = key.split("/").pop();
      if (!filename) continue;

      if (isInverted) {
        // Expected format: images/logos/inverted/domain.tld.ext
        const domainMatch = filename.match(/^(.+?)\.[^.]+$/);
        if (!domainMatch?.[1]) continue;
        const domain = domainMatch[1];

        if (!manifest[domain]) {
          manifest[domain] = {
            cdnUrl: "", // will be filled when normal variant processed
            originalSource: "unknown",
            invertedCdnUrl: `${cdnBase}/${key}`,
          };
        } else {
          manifest[domain].invertedCdnUrl = `${cdnBase}/${key}`;
        }
        continue;
      }

      // Normal logo path format: images/logos/domain_source_hash.ext
      const match = filename.match(/^(.+?)_([a-f0-9]{8})\.[^.]+$/);
      if (!match?.[1]) continue;

      const beforeHash = match[1];
      const parts = beforeHash.split("_");
      const source = parts.pop() || "unknown";
      const domainParts = parts;
      if (domainParts.length < 2) continue;

      const tld = domainParts[domainParts.length - 1];
      const name = domainParts.slice(0, -1).join(".");
      const domain = `${name}.${tld}`;

      const existing = manifest[domain];
      manifest[domain] = {
        cdnUrl: `${cdnBase}/${key}`,
        originalSource: source === "ddg" ? "duckduckgo" : source,
        invertedCdnUrl: existing?.invertedCdnUrl,
      };
    }

    return manifest;
  }

  /**
   * Create generic image manifest from S3 keys
   * @param s3Keys - Array of S3 keys
   * @returns Array of CDN URLs
   */
  private createImageManifest(s3Keys: string[]): string[] {
    const cdnBase = process.env.S3_CDN_URL || process.env.NEXT_PUBLIC_S3_CDN_URL || "";
    return s3Keys.map(key => `${cdnBase}/${key}`);
  }

  private async runContentGraphBuild(config: DataFetchConfig): Promise<DataFetchOperationSummary> {
    // Lazy load the content graph builder to avoid loading heavy modules unless needed
    const { buildContentGraph } = await import("@/lib/content-graph/build");
    return buildContentGraph(config);
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const manager = new DataFetchManager();

  const config: DataFetchConfig = {};

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
  if (args.includes("--force")) {
    config.forceRefresh = true;
  }

  const testLimitArg = args.find(arg => arg.startsWith("--testLimit="));
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

  console.log(`[DataFetchManagerCLI] Config:`, JSON.stringify(config, null, 2));

  manager
    .fetchData(config)
    .then(results => {
      logger.info(`[DataFetchManagerCLI] All tasks complete. Results count: ${results.length}`);
      results.forEach(result => {
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
