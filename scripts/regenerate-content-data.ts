#!/usr/bin/env bun
/**
 * Regenerate Content Data
 *
 * This script regenerates all precomputed content data including:
 * - Bookmark slug mappings
 * - Content graph (related content relationships)
 * - Search indexes
 *
 * Run this when:
 * - You've added new content (bookmarks, blog posts, etc.)
 * - You're experiencing issues with related content
 * - You need to rebuild the content graph
 *
 * Usage:
 *   bun scripts/regenerate-content-data.ts [options]
 *
 * Options:
 *   --bookmarks    Refresh bookmarks from API
 *   --force        Force refresh even if data exists
 *   --verbose      Show detailed logging
 */

import { loadEnvironmentWithMultilineSupport } from "@/lib/utils/env-loader";
loadEnvironmentWithMultilineSupport();

import logger from "@/lib/utils/logger";
import { DataFetchManager } from "@/lib/server/data-fetch-manager";
import { saveSlugMapping } from "@/lib/bookmarks/slug-manager";
import { getBookmarks } from "@/lib/bookmarks/service.server";
import type { UnifiedBookmark } from "@/types/bookmark";

// Parse command line arguments
const args = process.argv.slice(2);
const shouldRefreshBookmarks = args.includes("--bookmarks");
const forceRefresh = args.includes("--force");
const verbose = args.includes("--verbose");

async function main() {
  logger.info("🔄 Starting content data regeneration...");

  const manager = new DataFetchManager();
  const results: string[] = [];

  try {
    // Step 1: Refresh bookmarks if requested
    if (shouldRefreshBookmarks) {
      logger.info("📚 Refreshing bookmarks from API...");
      const bookmarkResult = await manager.fetchData({
        bookmarks: true,
        forceRefresh,
      });

      const bookmarkOp = bookmarkResult.find((r) => r.operation === "bookmarks");
      if (bookmarkOp?.success) {
        results.push(`✅ Bookmarks refreshed: ${bookmarkOp.itemsProcessed} items`);
      } else {
        results.push(`❌ Bookmarks refresh failed: ${bookmarkOp?.error || "Unknown error"}`);
      }
    }

    // Step 2: Regenerate bookmark slug mappings
    logger.info("🔗 Regenerating bookmark slug mappings...");
    try {
      const bookmarks = (await getBookmarks({ includeImageData: false })) as UnifiedBookmark[];
      await saveSlugMapping(bookmarks);
      results.push(`✅ Slug mappings regenerated for ${bookmarks.length} bookmarks`);

      if (verbose) {
        logger.info(`  - Generated ${bookmarks.length} unique slugs`);
      }
    } catch (error) {
      logger.error("Failed to regenerate slug mappings:", error);
      results.push(`❌ Slug mapping regeneration failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }

    // Step 3: Build content graph and related content mappings
    logger.info("🕸️ Building content graph and related content mappings...");
    const graphResult = await manager.fetchData({
      bookmarks: false, // Already refreshed if requested
      forceRefresh: true, // Always rebuild the graph
    });

    const graphOp = graphResult.find((r) => r.operation === "content-graph");
    if (graphOp?.success) {
      results.push(`✅ Content graph built: ${graphOp.itemsProcessed} items processed`);

      if (verbose) {
        logger.info(`  - Computed similarity scores for ${graphOp.itemsProcessed} content items`);
        logger.info(`  - Generated related content mappings`);
        logger.info(`  - Built tag co-occurrence graph`);
      }
    } else {
      results.push(`❌ Content graph build failed: ${graphOp?.error || "Unknown error"}`);
    }

    // Step 4: Build search indexes
    logger.info("🔍 Building search indexes...");
    const searchResult = await manager.fetchData({
      searchIndexes: true,
    });

    const searchOp = searchResult.find((r) => r.operation === "searchIndexes");
    if (searchOp?.success) {
      results.push(`✅ Search indexes built: ${searchOp.itemsProcessed} indexes created`);

      if (verbose) {
        logger.info("  - Posts index");
        logger.info("  - Bookmarks index");
        logger.info("  - Investments index");
        logger.info("  - Experience index");
        logger.info("  - Education index");
        logger.info("  - Projects index");
      }
    } else {
      results.push(`❌ Search index build failed: ${searchOp?.error || "Unknown error"}`);
    }

    // Print summary
    logger.info("\n📊 Regeneration Summary:");
    logger.info("========================");
    for (const result of results) {
      logger.info(result);
    }

    // Check if any operations failed
    const hasFailures = results.some((r) => r.startsWith("❌"));
    if (hasFailures) {
      logger.error("\n⚠️ Some operations failed. Please check the logs above for details.");
      process.exit(1);
    } else {
      logger.info("\n✨ All content data regenerated successfully!");

      // Provide next steps
      logger.info("\n📝 Next Steps:");
      logger.info("1. If in development, restart your dev server to see changes");
      logger.info("2. If in production, changes will be reflected immediately");
      logger.info("3. Clear any local caches if changes aren't visible");
    }
  } catch (error) {
    logger.error("Fatal error during regeneration:", error);
    process.exit(1);
  }
}

// Run the script
main().catch((error) => {
  logger.error("Unhandled error:", error);
  process.exit(1);
});
