#!/usr/bin/env bun

/**
 * Consolidated Screenshot Management Tool
 *
 * This script provides comprehensive management for bookmark screenshots and OG images,
 * combining functionality from multiple screenshot scripts into one utility.
 *
 * Usage:
 *   bun run scripts/screenshot-manager.ts [command] [options]
 *
 * Commands:
 *   check      - Check bookmarks with only screenshots (no OG images)
 *   verify     - Verify screenshot enrichment and data integrity
 *   fix-og     - Fix missing OG images using screenshot data
 *   fix-direct - Fix bookmarks using direct screenshot URLs
 *   persist    - Persist screenshot images to S3
 *   all        - Run all checks (non-destructive)
 *
 * Options:
 *   --dry-run  - Preview changes without modifying data
 *   --limit N  - Process only N bookmarks (for testing)
 */

import { readJsonS3Optional, writeJsonS3 } from "@/lib/s3/json";
import { BOOKMARKS_S3_PATHS } from "@/lib/constants";
import type { UnifiedBookmark } from "@/types";
import {
  bookmarksIndexSchema,
  unifiedBookmarksArraySchema,
  type BookmarksIndex,
} from "@/types/bookmark";

// Command line argument parsing
const args = process.argv.slice(2);
const command = args[0] || "check";
const validCommands = ["check", "verify", "fix-og", "fix-direct", "persist", "all"];

if (!validCommands.includes(command)) {
  console.error(`Invalid command: ${command}`);
  console.error(`Valid commands: ${validCommands.join(", ")}`);
  process.exit(1);
}

// Parse options
const isDryRun = args.includes("--dry-run");
const limitIndex = args.indexOf("--limit");
const limitArg = limitIndex !== -1 ? args[limitIndex + 1] : undefined;
const limit = limitArg ? parseInt(limitArg, 10) : undefined;

if (isDryRun) {
  console.log("🔒 DRY RUN MODE - No changes will be saved");
}
if (limit) {
  console.log(`📊 LIMIT MODE - Processing only ${limit} bookmarks`);
}

// Helper functions

function hasScreenshot(bookmark: UnifiedBookmark): boolean {
  return !!bookmark.content?.screenshotAssetId;
}

function hasOgImage(bookmark: UnifiedBookmark): boolean {
  return !!bookmark.ogImage;
}

function getScreenshotUrl(bookmark: UnifiedBookmark): string | undefined {
  // Build from asset ID if available
  if (bookmark.content?.screenshotAssetId) {
    return `https://assets.literal.club/${bookmark.content.screenshotAssetId}`;
  }

  return undefined;
}

// Check functions

async function checkScreenshotOnlyBookmarks() {
  console.log("\n📸 SCREENSHOT-ONLY BOOKMARKS CHECK");
  console.log("─".repeat(40));

  try {
    const bookmarks = await readJsonS3Optional<UnifiedBookmark[]>(
      BOOKMARKS_S3_PATHS.FILE,
      unifiedBookmarksArraySchema,
    );

    if (!bookmarks || bookmarks.length === 0) {
      console.log("❌ No bookmarks found");
      return false;
    }

    const screenshotOnly = bookmarks.filter((b) => hasScreenshot(b) && !hasOgImage(b));
    const ogOnly = bookmarks.filter((b) => !hasScreenshot(b) && hasOgImage(b));
    const both = bookmarks.filter((b) => hasScreenshot(b) && hasOgImage(b));
    const neither = bookmarks.filter((b) => !hasScreenshot(b) && !hasOgImage(b));

    console.log(`Total bookmarks: ${bookmarks.length}`);
    console.log(`\n📊 Image Coverage:`);
    console.log(
      `  Screenshot + OG: ${both.length} (${((both.length / bookmarks.length) * 100).toFixed(1)}%)`,
    );
    console.log(
      `  Screenshot only: ${screenshotOnly.length} (${((screenshotOnly.length / bookmarks.length) * 100).toFixed(1)}%)`,
    );
    console.log(
      `  OG image only: ${ogOnly.length} (${((ogOnly.length / bookmarks.length) * 100).toFixed(1)}%)`,
    );
    console.log(
      `  No images: ${neither.length} (${((neither.length / bookmarks.length) * 100).toFixed(1)}%)`,
    );

    if (screenshotOnly.length > 0) {
      console.log("\n🔍 SAMPLE SCREENSHOT-ONLY BOOKMARKS:");
      screenshotOnly.slice(0, 5).forEach((b, i) => {
        console.log(`${i + 1}. ${b.title || "Untitled"}`);
        console.log(`   ID: ${b.id}`);
        console.log(`   URL: ${b.url}`);
        const screenshotUrl = getScreenshotUrl(b);
        if (screenshotUrl) {
          console.log(`   Screenshot: ${screenshotUrl.substring(0, 60)}...`);
        }
      });

      console.log(`\n💡 TIP: Run 'bun run scripts/screenshot-manager.ts fix-og' to fix these`);
    }

    return true;
  } catch (error) {
    console.error("Error checking screenshots:", error);
    return false;
  }
}

async function verifyScreenshotEnrichment() {
  console.log("\n✅ SCREENSHOT ENRICHMENT VERIFICATION");
  console.log("─".repeat(40));

  try {
    const bookmarks = await readJsonS3Optional<UnifiedBookmark[]>(
      BOOKMARKS_S3_PATHS.FILE,
      unifiedBookmarksArraySchema,
    );

    if (!bookmarks || bookmarks.length === 0) {
      console.log("❌ No bookmarks found");
      return false;
    }

    // Analyze screenshot data structure
    const screenshotFields: Record<string, number> = {};
    const ogFields: Record<string, number> = {};

    bookmarks.forEach((b) => {
      // Check screenshot fields
      if (b.content?.screenshotAssetId)
        screenshotFields["content.screenshotAssetId"] =
          (screenshotFields["content.screenshotAssetId"] || 0) + 1;

      // Check OG fields
      if (b.ogImage) ogFields.ogImage = (ogFields.ogImage || 0) + 1;
      if (b.content?.imageUrl)
        ogFields["content.imageUrl"] = (ogFields["content.imageUrl"] || 0) + 1;
    });

    console.log("📷 Screenshot Field Usage:");
    Object.entries(screenshotFields).forEach(([field, count]) => {
      const percentage = ((count / bookmarks.length) * 100).toFixed(1);
      console.log(`  ${field}: ${count} (${percentage}%)`);
    });

    console.log("\n🖼️ OG Image Field Usage:");
    Object.entries(ogFields).forEach(([field, count]) => {
      const percentage = ((count / bookmarks.length) * 100).toFixed(1);
      console.log(`  ${field}: ${count} (${percentage}%)`);
    });

    // Check for potential data quality issues
    console.log("\n⚠️  Data Quality Checks:");

    const invalidScreenshots = bookmarks.filter((b) => {
      const url = getScreenshotUrl(b);
      return url && (!url.startsWith("http") || url.includes("undefined") || url.includes("null"));
    });

    if (invalidScreenshots.length > 0) {
      console.log(`  ❌ ${invalidScreenshots.length} bookmarks with invalid screenshot URLs`);
      invalidScreenshots.slice(0, 3).forEach((b) => {
        console.log(`    - ${b.id}: ${getScreenshotUrl(b)}`);
      });
    } else {
      console.log(`  ✅ All screenshot URLs are valid`);
    }

    const duplicateImages = new Map<string, number>();
    bookmarks.forEach((b) => {
      const url = b.ogImage;
      if (url) {
        duplicateImages.set(url, (duplicateImages.get(url) || 0) + 1);
      }
    });

    const duplicates = Array.from(duplicateImages.entries()).filter(([, count]) => count > 1);
    if (duplicates.length > 0) {
      console.log(`  ⚠️  ${duplicates.length} duplicate OG images found`);
      duplicates.slice(0, 3).forEach(([url, count]) => {
        console.log(`    - Used ${count} times: ${url.substring(0, 50)}...`);
      });
    } else {
      console.log(`  ✅ No duplicate OG images`);
    }

    return true;
  } catch (error) {
    console.error("Error verifying enrichment:", error);
    return false;
  }
}

async function fixMissingOgImages() {
  console.log("\n🔧 FIXING MISSING OG IMAGES");
  console.log("─".repeat(40));

  try {
    const bookmarks = await readJsonS3Optional<UnifiedBookmark[]>(
      BOOKMARKS_S3_PATHS.FILE,
      unifiedBookmarksArraySchema,
    );

    if (!bookmarks || bookmarks.length === 0) {
      console.log("❌ No bookmarks found");
      return false;
    }

    const needsFix = bookmarks.filter((b) => hasScreenshot(b) && !hasOgImage(b));
    const toProcess = limit ? needsFix.slice(0, limit) : needsFix;

    console.log(`Found ${needsFix.length} bookmarks needing OG image fix`);
    if (limit) {
      console.log(`Processing first ${toProcess.length} bookmarks`);
    }

    let fixed = 0;
    const updated = bookmarks.map((bookmark) => {
      if (!toProcess.some((b) => b.id === bookmark.id)) {
        return bookmark;
      }

      const screenshotUrl = getScreenshotUrl(bookmark);
      if (screenshotUrl && !bookmark.ogImage) {
        console.log(`  Fixing: ${bookmark.title || bookmark.id}`);
        console.log(`    Screenshot: ${screenshotUrl.substring(0, 60)}...`);
        fixed++;

        return {
          ...bookmark,
          ogImage: screenshotUrl,
        };
      }

      return bookmark;
    });

    console.log(`\n✅ Fixed ${fixed} bookmarks`);

    if (!isDryRun && fixed > 0) {
      console.log("💾 Saving updated bookmarks...");
      await writeJsonS3(BOOKMARKS_S3_PATHS.FILE, updated);

      // Update index with new timestamp
      const index = await readJsonS3Optional<BookmarksIndex>(
        BOOKMARKS_S3_PATHS.INDEX,
        bookmarksIndexSchema,
      );
      if (index) {
        await writeJsonS3(BOOKMARKS_S3_PATHS.INDEX, {
          ...index,
          lastModified: new Date().toISOString(),
        });
      }

      console.log("✅ Changes saved successfully");
    }

    return true;
  } catch (error) {
    console.error("Error fixing OG images:", error);
    return false;
  }
}

async function fixDirectScreenshots() {
  console.log("\n🔧 FIXING DIRECT SCREENSHOT URLS");
  console.log("─".repeat(40));

  try {
    const bookmarks = await readJsonS3Optional<UnifiedBookmark[]>(
      BOOKMARKS_S3_PATHS.FILE,
      unifiedBookmarksArraySchema,
    );

    if (!bookmarks || bookmarks.length === 0) {
      console.log("❌ No bookmarks found");
      return false;
    }

    // Find bookmarks with asset IDs but no OG images
    const needsFix = bookmarks.filter((b) => b.content?.screenshotAssetId && !b.ogImage);

    const toProcess = limit ? needsFix.slice(0, limit) : needsFix;

    console.log(`Found ${needsFix.length} bookmarks needing direct URL fix`);
    if (limit) {
      console.log(`Processing first ${toProcess.length} bookmarks`);
    }

    let fixed = 0;
    const updated = bookmarks.map((bookmark) => {
      if (!toProcess.some((b) => b.id === bookmark.id)) {
        return bookmark;
      }

      if (bookmark.content?.screenshotAssetId && !bookmark.ogImage) {
        const directUrl = `https://assets.literal.club/${bookmark.content.screenshotAssetId}`;
        console.log(`  Fixing: ${bookmark.title || bookmark.id}`);
        console.log(`    Asset ID: ${bookmark.content.screenshotAssetId}`);
        console.log(`    Direct URL: ${directUrl}`);
        fixed++;

        return {
          ...bookmark,
          ogImage: directUrl,
        };
      }

      return bookmark;
    });

    console.log(`\n✅ Fixed ${fixed} bookmarks`);

    if (!isDryRun && fixed > 0) {
      console.log("💾 Saving updated bookmarks...");
      await writeJsonS3(BOOKMARKS_S3_PATHS.FILE, updated);
      console.log("✅ Changes saved successfully");
    }

    return true;
  } catch (error) {
    console.error("Error fixing direct screenshots:", error);
    return false;
  }
}

async function persistScreenshotImages() {
  console.log("\n💾 PERSISTING SCREENSHOT IMAGES");
  console.log("─".repeat(40));

  console.log("⚠️  This functionality requires image download and S3 upload capabilities.");
  console.log("Implementation would:");
  console.log("  1. Download screenshot images from Literal Club assets");
  console.log("  2. Upload to our own S3 bucket");
  console.log("  3. Update bookmark URLs to point to our copies");
  console.log("\nThis is a placeholder for future implementation.");

  return true;
}

// Main execution
async function main() {
  console.log("📸 SCREENSHOT MANAGEMENT TOOL");
  console.log(`Running command: ${command}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log("=".repeat(50));

  let success = true;

  switch (command) {
    case "check":
      success = await checkScreenshotOnlyBookmarks();
      break;

    case "verify":
      success = await verifyScreenshotEnrichment();
      break;

    case "fix-og":
      success = await fixMissingOgImages();
      break;

    case "fix-direct":
      success = await fixDirectScreenshots();
      break;

    case "persist":
      success = await persistScreenshotImages();
      break;

    case "all": {
      // Run all non-destructive checks
      const results = {
        check: await checkScreenshotOnlyBookmarks(),
        verify: await verifyScreenshotEnrichment(),
      };

      console.log("\n" + "=".repeat(50));
      console.log("📊 OVERALL RESULTS:");
      console.log("─".repeat(40));
      Object.entries(results).forEach(([cmd, result]) => {
        console.log(`${result ? "✅" : "❌"} ${cmd}`);
      });

      success = Object.values(results).every((r) => r);

      if (success) {
        console.log("\n💡 Available fix commands:");
        console.log("  fix-og     - Fix missing OG images");
        console.log("  fix-direct - Fix direct screenshot URLs");
        console.log("\nRun with --dry-run to preview changes");
      }
      break;
    }
  }

  console.log("\n" + "=".repeat(50));
  if (success) {
    console.log("✅ Operation completed successfully");
  } else {
    console.log("❌ Operation encountered issues");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
