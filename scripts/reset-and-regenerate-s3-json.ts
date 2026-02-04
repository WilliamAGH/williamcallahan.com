#!/usr/bin/env bun
/**
 * COMPREHENSIVE S3 JSON RESET AND REGENERATION SCRIPT
 * =====================================================
 *
 * This script safely deletes ALL JSON files in S3 object storage related to:
 * - Bookmarks (all pages, tags, indexes, mappings)
 * - GitHub activity data
 * - Search indexes
 * - Content graph and related content
 * - Image manifests
 * - Rate limiting data
 * - OpenGraph data
 *
 * Then performs a full regeneration with comprehensive validation and audit trail.
 *
 * SAFETY FEATURES:
 * - Dry-run mode by default
 * - Environment-aware (respects dev/prod suffixes)
 * - Creates backup manifest before deletion
 * - Comprehensive audit logging
 * - Rollback capability
 *
 * Usage:
 *   # Dry run (default - shows what would be deleted)
 *   bun scripts/reset-and-regenerate-s3-json.ts
 *
 *   # Execute deletion and regeneration
 *   bun scripts/reset-and-regenerate-s3-json.ts --execute
 *
 *   # Force mode (skips confirmation prompts)
 *   bun scripts/reset-and-regenerate-s3-json.ts --execute --force
 *
 *   # Verbose logging
 *   bun scripts/reset-and-regenerate-s3-json.ts --execute --verbose
 *
 *   # Exclude specific categories (e.g., skip GitHub activity)
 *   bun scripts/reset-and-regenerate-s3-json.ts --execute --exclude=github
 *   bun scripts/reset-and-regenerate-s3-json.ts --execute --exclude=github,logos
 *   bun scripts/reset-and-regenerate-s3-json.ts --execute --exclude=github,logos,images
 *
 *   # Include only specific categories
 *   bun scripts/reset-and-regenerate-s3-json.ts --execute --only=bookmarks,search
 */

import { loadEnvironmentWithMultilineSupport } from "@/lib/utils/env-loader";
loadEnvironmentWithMultilineSupport();

import { deleteFromS3, getS3ObjectMetadata, listS3Objects } from "@/lib/s3/objects";
import { DataFetchManager } from "@/lib/server/data-fetch-manager";
import { saveSlugMapping } from "@/lib/bookmarks/slug-manager";
import { getBookmarks } from "@/lib/bookmarks/service.server";
import logger from "@/lib/utils/logger";
import { ENVIRONMENT_SUFFIX, getEnvironment } from "@/lib/config/environment";
import type { UnifiedBookmark } from "@/types/bookmark";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import readline from "node:readline";

// S3 path constants are now encapsulated in CATEGORY_CONFIG from @/lib/s3-reset
import type { DeletionStats, RegenerationStats, AuditLog, CategoryKey } from "@/types/s3-reset";

// Import DRY utilities for category management and stats factories
import {
  CATEGORY_CONFIG,
  getCategoryForFile,
  categorizeFiles,
  createEmptyDeletionStats,
  createEmptyRegenerationStats,
} from "@/lib/s3-reset";

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = !args.includes("--execute");
const forceMode = args.includes("--force");
const verbose = args.includes("--verbose");
const shouldBackup = !args.includes("--no-backup");

// Parse exclude/only options
const excludeArg = args.find((arg) => arg.startsWith("--exclude="));
const onlyArg = args.find((arg) => arg.startsWith("--only="));
const excludeCategories = excludeArg
  ? (excludeArg
      .split("=")[1]
      ?.split(",")
      .map((s) => s.trim().toLowerCase()) ?? [])
  : [];
const onlyCategories = onlyArg
  ? (onlyArg
      .split("=")[1]
      ?.split(",")
      .map((s) => s.trim().toLowerCase()) ?? [])
  : [];

if (excludeArg && onlyArg) {
  console.error("❌ Cannot use both --exclude and --only options together");
  process.exit(1);
}

// Environment configuration
const environment = getEnvironment();
const envSuffix = ENVIRONMENT_SUFFIX;

// Audit file paths
const AUDIT_DIR = join(process.cwd(), ".s3-reset-audits");
const AUDIT_FILE = join(
  AUDIT_DIR,
  `reset-audit-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
);
const BACKUP_MANIFEST = join(
  AUDIT_DIR,
  `backup-manifest-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
);

/**
 * Category mappings for include/exclude functionality.
 * Re-exported from centralized CATEGORY_CONFIG for backward compatibility.
 */
const CATEGORY_MAPPINGS = CATEGORY_CONFIG;

/**
 * Get all JSON file patterns that should be deleted
 */
function getAllJsonPatterns(): string[] {
  const patterns: string[] = [];
  const categoriesToInclude = new Set<CategoryKey>();

  // Determine which categories to include
  if (onlyCategories.length > 0) {
    // Include only specified categories
    for (const cat of onlyCategories) {
      if (cat in CATEGORY_MAPPINGS) {
        categoriesToInclude.add(cat as CategoryKey);
      } else {
        console.warn(`⚠️ Unknown category: ${cat}`);
      }
    }
  } else {
    // Include all categories except excluded ones
    for (const key of Object.keys(CATEGORY_MAPPINGS) as CategoryKey[]) {
      if (!excludeCategories.includes(key)) {
        categoriesToInclude.add(key);
      }
    }
  }

  // Add paths for included categories
  for (const key of categoriesToInclude) {
    patterns.push(...CATEGORY_MAPPINGS[key].paths);
  }

  // Always scan the root json/ directory to catch any orphaned files
  // (but we'll filter them later based on categories)
  if (patterns.length === 0 || verbose) {
    patterns.push("json/");
  }

  return patterns;
}

/**
 * Check if a file belongs to an included category.
 * Uses centralized getCategoryForFile() to eliminate duplicate path-matching logic.
 */
function shouldIncludeFile(file: string): boolean {
  const category = getCategoryForFile(file);
  if (category) {
    return shouldIncludeCategory(category);
  }
  // Unknown files - include if no specific filter is set
  return onlyCategories.length === 0 && excludeCategories.length === 0;
}

/**
 * Check if a category should be included
 */
function shouldIncludeCategory(category: CategoryKey): boolean {
  if (onlyCategories.length > 0) {
    return onlyCategories.includes(category);
  }
  return !excludeCategories.includes(category);
}

/**
 * Prompt user for confirmation
 */
async function promptConfirmation(message: string): Promise<boolean> {
  if (forceMode) return true;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (yes/no): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "yes" || answer.toLowerCase() === "y");
    });
  });
}

/**
 * Create backup manifest of files to be deleted
 */
async function createBackupManifest(files: string[]): Promise<void> {
  if (!shouldBackup) return;

  logger.info("📦 Creating backup manifest...");

  const manifest = {
    timestamp: new Date().toISOString(),
    environment,
    envSuffix,
    fileCount: files.length,
    files: [] as Array<{ key: string; metadata: Record<string, unknown> | null }>,
  };

  // Get metadata for each file (in batches to avoid overwhelming S3)
  const BATCH_SIZE = 10;
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const metadataPromises = batch.map(async (file) => {
      const metadata = await getS3ObjectMetadata(file);
      return { key: file, metadata: metadata as Record<string, unknown> | null };
    });

    const results = await Promise.all(metadataPromises);
    manifest.files.push(...results);

    if (verbose) {
      logger.info(
        `  - Processed metadata for ${Math.min(i + BATCH_SIZE, files.length)}/${files.length} files`,
      );
    }
  }

  // Ensure audit directory exists
  await fs.mkdir(AUDIT_DIR, { recursive: true });

  // Write manifest
  await fs.writeFile(BACKUP_MANIFEST, JSON.stringify(manifest, null, 2));
  logger.info(`✅ Backup manifest created: ${BACKUP_MANIFEST}`);
}

/**
 * Delete all JSON files from S3
 */
async function deleteJsonFiles(): Promise<DeletionStats> {
  const stats = createEmptyDeletionStats();

  logger.info("🔍 Scanning for JSON files to delete...");

  const patterns = getAllJsonPatterns();
  const allFiles = new Set<string>();

  // List all files matching our patterns
  for (const pattern of patterns) {
    if (verbose) {
      logger.info(`  - Scanning pattern: ${pattern}`);
    }

    const files = await listS3Objects(pattern);
    files.forEach((file) => {
      // Only include JSON files and ensure they match our environment
      if (file.endsWith(".json")) {
        // Check category filter first
        if (!shouldIncludeFile(file)) {
          if (verbose) {
            logger.info(`  - Skipping ${file} (excluded category)`);
          }
          return;
        }

        // Check if file matches current environment suffix
        if (environment === "production") {
          // In production, include files that do NOT have -dev or -test anywhere in the path
          if (!file.includes("-dev") && !file.includes("-test")) {
            allFiles.add(file);
          }
        } else {
          // For dev/test, require either:
          // - filename ends with the correct suffix (e.g., thing-dev.json), or
          // - directory contains the suffix (e.g., content-graph-dev/thing.json)
          const envSuffix = environment === "development" ? "-dev" : "-test";
          const expectedEnding = `${envSuffix}.json`;
          const expectedDir = `${envSuffix}/`;
          if (file.endsWith(expectedEnding) || file.includes(expectedDir)) {
            allFiles.add(file);
          }
        }
      }
    });
  }

  const fileList = Array.from(allFiles);
  stats.totalFiles = fileList.length;

  logger.info(`📊 Found ${stats.totalFiles} JSON files to delete`);

  if (stats.totalFiles === 0) {
    logger.warn("⚠️ No JSON files found to delete");
    return stats;
  }

  // Show all files to be deleted (organized by category)
  logger.info("\n📝 Files to be deleted:");

  // Organize files by category using centralized utility
  const filesByCategory = categorizeFiles(fileList);

  // Display files by category
  for (const [category, files] of Object.entries(filesByCategory)) {
    if (files.length > 0) {
      logger.info(`\n  ${category} (${files.length} files):`);
      if (verbose || files.length <= 20) {
        // Show all files if verbose mode or category has 20 or fewer files
        files.forEach((file) => {
          logger.info(`    - ${file}`);
        });
      } else {
        // Show first 10 and last 5 files for large categories in non-verbose mode
        files.slice(0, 10).forEach((file) => {
          logger.info(`    - ${file}`);
        });
        logger.info(`    ... ${files.length - 15} more files ...`);
        files.slice(-5).forEach((file) => {
          logger.info(`    - ${file}`);
        });
      }
    }
  }

  // Summary line
  logger.info(
    `\n📊 Total: ${stats.totalFiles} files across ${Object.entries(filesByCategory).filter(([_, files]) => files.length > 0).length} categories`,
  );

  // Option to export full list
  if (!verbose && stats.totalFiles > 50) {
    logger.info("\n💡 Tip: Use --verbose flag to see all files in each category");
  }

  if (isDryRun) {
    logger.info("\n🔸 DRY RUN MODE - No files will be deleted");
    logger.info("🔸 Run with --execute to perform actual deletion");
    stats.skippedFiles = stats.totalFiles;
    return stats;
  }

  // Create backup manifest
  if (shouldBackup) {
    await createBackupManifest(fileList);
  }

  // Confirm deletion
  const confirmed = await promptConfirmation(
    `\n⚠️ WARNING: About to delete ${stats.totalFiles} JSON files from S3. Continue?`,
  );

  if (!confirmed) {
    logger.info("❌ Deletion cancelled by user");
    stats.skippedFiles = stats.totalFiles;
    return stats;
  }

  // Perform deletion
  logger.info("\n🗑️ Deleting JSON files...");

  const BATCH_SIZE = 10;
  for (let i = 0; i < fileList.length; i += BATCH_SIZE) {
    const batch = fileList.slice(i, i + BATCH_SIZE);

    const deletePromises = batch.map(async (file) => {
      try {
        await deleteFromS3(file);
        stats.deletedFiles++;
        if (verbose) {
          logger.info(`  ✓ Deleted: ${file}`);
        }
      } catch (error) {
        stats.failedFiles++;
        const errorMsg = error instanceof Error ? error.message : String(error);
        stats.errors.push({ file, error: errorMsg });
        logger.error(`  ✗ Failed to delete ${file}: ${errorMsg}`);
      }
    });

    await Promise.all(deletePromises);

    // Progress update
    if (!verbose && i % 100 === 0) {
      logger.info(
        `  Progress: ${Math.min(i + BATCH_SIZE, fileList.length)}/${fileList.length} files processed`,
      );
    }
  }

  return stats;
}

/**
 * Regenerate all data
 */
async function regenerateData(): Promise<RegenerationStats> {
  const stats = createEmptyRegenerationStats();

  logger.info("\n🔄 Starting data regeneration...");

  const manager = new DataFetchManager();

  try {
    // Step 1: Regenerate bookmarks (if included)
    if (shouldIncludeCategory("bookmarks")) {
      logger.info("\n📚 Regenerating bookmarks...");
      const bookmarkResult = await manager.fetchData({
        bookmarks: true,
        forceRefresh: true,
      });

      const bookmarkOp = bookmarkResult.find((r) => r.operation === "bookmarks");
      if (bookmarkOp?.success) {
        stats.bookmarks = {
          success: true,
          count: bookmarkOp.itemsProcessed || 0,
        };
        logger.info(`  ✅ Bookmarks regenerated: ${stats.bookmarks.count} items`);
      } else {
        stats.bookmarks.error = bookmarkOp?.error || "Unknown error";
        logger.error(`  ❌ Bookmarks regeneration failed: ${stats.bookmarks.error}`);
      }
    } else {
      logger.info("\n📚 Skipping bookmarks regeneration (excluded)");
      stats.bookmarks = { success: true, count: 0 };
    }

    // Step 2: Regenerate slug mappings (if bookmarks included)
    if (shouldIncludeCategory("bookmarks")) {
      logger.info("\n🔗 Regenerating slug mappings...");
      try {
        const bookmarks = (await getBookmarks({ includeImageData: false })) as UnifiedBookmark[];
        await saveSlugMapping(bookmarks);
        stats.slugMappings = {
          success: true,
          count: bookmarks.length,
        };
        logger.info(`  ✅ Slug mappings regenerated: ${stats.slugMappings.count} items`);
      } catch (error) {
        stats.slugMappings.error = error instanceof Error ? error.message : "Unknown error";
        logger.error(`  ❌ Slug mapping regeneration failed: ${stats.slugMappings.error}`);
      }
    } else {
      stats.slugMappings = { success: true, count: 0 };
    }

    // Step 3: Regenerate GitHub activity (if included)
    if (shouldIncludeCategory("github")) {
      logger.info("\n🐙 Regenerating GitHub activity data...");
      const githubResult = await manager.fetchData({
        githubActivity: true,
        forceRefresh: true,
      });

      const githubOp = githubResult.find((r) => r.operation === "github-activity");
      if (githubOp?.success) {
        stats.github = {
          success: true,
          count: githubOp.itemsProcessed || 0,
        };
        logger.info(`  ✅ GitHub activity regenerated: ${stats.github.count} items`);
      } else {
        stats.github.error = githubOp?.error || "Unknown error";
        logger.error(`  ❌ GitHub activity regeneration failed: ${stats.github.error}`);
      }
    } else {
      logger.info("\n🐙 Skipping GitHub activity regeneration (excluded)");
      stats.github = { success: true, count: 0 };
    }

    // Step 4: Regenerate logos (if included)
    if (shouldIncludeCategory("logos") || shouldIncludeCategory("images")) {
      logger.info("\n🎨 Regenerating logos...");
      const logoResult = await manager.fetchData({
        logos: true,
        forceRefresh: true,
      });

      const logoOp = logoResult.find((r) => r.operation === "logos");
      if (logoOp?.success) {
        stats.logos = {
          success: true,
          count: logoOp.itemsProcessed || 0,
        };
        logger.info(`  ✅ Logos regenerated: ${stats.logos.count} items`);
      } else {
        stats.logos.error = logoOp?.error || "Unknown error";
        logger.error(`  ❌ Logo regeneration failed: ${stats.logos.error}`);
      }
    } else {
      stats.logos = { success: true, count: 0 };
    }

    // Step 5: Build content graph (if included)
    // Note: Content graph depends on bookmarks and other content, so regenerate if content OR bookmarks are included
    if (shouldIncludeCategory("content") || shouldIncludeCategory("bookmarks")) {
      logger.info("\n🕸️ Building content graph...");
      const graphResult = await manager.fetchData({
        forceRefresh: true,
      });

      const graphOp = graphResult.find((r) => r.operation === "content-graph");
      if (graphOp?.success) {
        stats.contentGraph = {
          success: true,
          count: graphOp.itemsProcessed || 0,
        };
        logger.info(`  ✅ Content graph built: ${stats.contentGraph.count} items`);
      } else {
        stats.contentGraph.error = graphOp?.error || "Unknown error";
        logger.error(`  ❌ Content graph build failed: ${stats.contentGraph.error}`);
      }
    } else {
      stats.contentGraph = { success: true, count: 0 };
    }

    // Step 6: Build search indexes (if included)
    if (shouldIncludeCategory("search")) {
      logger.info("\n🔍 Building search indexes...");
      const searchResult = await manager.fetchData({
        searchIndexes: true,
        forceRefresh: true,
      });

      const searchOp = searchResult.find((r) => r.operation === "searchIndexes");
      if (searchOp?.success) {
        stats.search = {
          success: true,
          count: searchOp.itemsProcessed || 0,
        };
        logger.info(`  ✅ Search indexes built: ${stats.search.count} indexes`);
      } else {
        stats.search.error = searchOp?.error || "Unknown error";
        logger.error(`  ❌ Search index build failed: ${stats.search.error}`);
      }
    } else {
      stats.search = { success: true, count: 0 };
    }
  } catch (error) {
    // Log the fatal error and re-throw to ensure caller knows regeneration failed
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Fatal error during regeneration: ${errorMessage}`);
    throw new Error(`Regeneration failed: ${errorMessage}`, { cause: error });
  }

  return stats;
}

/**
 * Generate audit report
 */
async function generateAuditReport(
  deletionStats: DeletionStats,
  regenerationStats: RegenerationStats,
  duration: number,
): Promise<void> {
  const auditLog: AuditLog = {
    timestamp: new Date().toISOString(),
    environment,
    envSuffix,
    isDryRun,
    deletionStats,
    regenerationStats,
    duration,
    success:
      deletionStats.failedFiles === 0 &&
      (isDryRun || Object.values(regenerationStats).every((stat) => stat.success)),
  };

  // Ensure audit directory exists
  await fs.mkdir(AUDIT_DIR, { recursive: true });

  // Write audit log
  await fs.writeFile(AUDIT_FILE, JSON.stringify(auditLog, null, 2));

  // Print summary
  logger.info("\n" + "=".repeat(60));
  logger.info("📊 RESET AND REGENERATION SUMMARY");
  logger.info("=".repeat(60));

  logger.info(`\n🌍 Environment: ${environment} (suffix: ${envSuffix})`);
  logger.info(`⏱️ Duration: ${(duration / 1000).toFixed(2)} seconds`);

  if (isDryRun) {
    logger.info("\n🔸 DRY RUN MODE - No actual changes were made");
  }

  logger.info("\n📉 Deletion Statistics:");
  logger.info(`  Total files found: ${deletionStats.totalFiles}`);
  logger.info(`  Files deleted: ${deletionStats.deletedFiles}`);
  logger.info(`  Files failed: ${deletionStats.failedFiles}`);
  logger.info(`  Files skipped: ${deletionStats.skippedFiles}`);

  if (deletionStats.errors.length > 0) {
    logger.error("\n❌ Deletion Errors:");
    deletionStats.errors.slice(0, 5).forEach((err) => {
      logger.error(`  - ${err.file}: ${err.error}`);
    });
    if (deletionStats.errors.length > 5) {
      logger.error(`  ... and ${deletionStats.errors.length - 5} more errors`);
    }
  }

  if (!isDryRun) {
    logger.info("\n📈 Regeneration Statistics:");
    logger.info(
      `  Bookmarks: ${regenerationStats.bookmarks.success ? "✅" : "❌"} (${regenerationStats.bookmarks.count} items)`,
    );
    logger.info(
      `  Slug Mappings: ${regenerationStats.slugMappings.success ? "✅" : "❌"} (${regenerationStats.slugMappings.count} items)`,
    );
    logger.info(
      `  GitHub Activity: ${regenerationStats.github.success ? "✅" : "❌"} (${regenerationStats.github.count} items)`,
    );
    logger.info(
      `  Logos: ${regenerationStats.logos.success ? "✅" : "❌"} (${regenerationStats.logos.count} items)`,
    );
    logger.info(
      `  Content Graph: ${regenerationStats.contentGraph.success ? "✅" : "❌"} (${regenerationStats.contentGraph.count} items)`,
    );
    logger.info(
      `  Search Indexes: ${regenerationStats.search.success ? "✅" : "❌"} (${regenerationStats.search.count} indexes)`,
    );
  }

  logger.info(`\n📝 Audit log saved to: ${AUDIT_FILE}`);
  if (shouldBackup && !isDryRun) {
    logger.info(`📦 Backup manifest saved to: ${BACKUP_MANIFEST}`);
  }

  logger.info("\n" + "=".repeat(60));

  if (auditLog.success) {
    logger.info("✅ RESET AND REGENERATION COMPLETED SUCCESSFULLY");
  } else {
    logger.error("⚠️ RESET AND REGENERATION COMPLETED WITH ERRORS");
  }

  logger.info("=".repeat(60));
}

/**
 * Main execution
 */
async function main() {
  const startTime = Date.now();

  logger.info("🚀 S3 JSON RESET AND REGENERATION SCRIPT");
  logger.info("=".repeat(60));
  logger.info(`Environment: ${environment}`);
  logger.info(`Environment Suffix: ${envSuffix}`);
  logger.info(`Mode: ${isDryRun ? "DRY RUN" : "EXECUTE"}`);
  logger.info(`Force Mode: ${forceMode}`);
  logger.info(`Backup: ${shouldBackup}`);
  logger.info(`Verbose: ${verbose}`);

  if (excludeCategories.length > 0) {
    logger.info(`Excluding: ${excludeCategories.join(", ")}`);
  }
  if (onlyCategories.length > 0) {
    logger.info(`Only Including: ${onlyCategories.join(", ")}`);
  }
  logger.info("=".repeat(60));

  let deletionStats = createEmptyDeletionStats();
  let regenerationStats = createEmptyRegenerationStats();

  try {
    // Phase 1: Delete JSON files
    deletionStats = await deleteJsonFiles();

    // Phase 2: Regenerate data (only if not dry run)
    if (!isDryRun && deletionStats.deletedFiles > 0) {
      regenerationStats = await regenerateData();
    }

    // Phase 3: Generate audit report
    const duration = Date.now() - startTime;
    await generateAuditReport(deletionStats, regenerationStats, duration);
  } catch (error) {
    logger.error("💥 Fatal error:", error);
    process.exit(1);
  }

  // Exit with appropriate code
  const success =
    deletionStats.failedFiles === 0 &&
    (isDryRun || Object.values(regenerationStats).every((stat) => stat.success));
  process.exit(success ? 0 : 1);
}

// Run the script
main().catch((error) => {
  logger.error("💥 Unhandled error:", error);
  process.exit(1);
});
