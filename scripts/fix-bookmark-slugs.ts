#!/usr/bin/env bun
/**
 * Script to regenerate bookmark slug mapping
 * This fixes the issue where bookmarks return 404 in production
 *
 * Run with: bun scripts/fix-bookmark-slugs.ts
 */

import { loadSlugMapping, saveSlugMapping } from "@/lib/bookmarks/slug-manager";
import { getBookmarks } from "@/lib/bookmarks/service.server";
import { readJsonS3 } from "@/lib/s3-utils";
import { BOOKMARKS_S3_PATHS } from "@/lib/constants";
import type { UnifiedBookmark } from "@/types";

console.log("=== Bookmark Slug Mapping Fix Script ===");
console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
console.log(`S3 Bucket: ${process.env.S3_BUCKET || "NOT SET"}`);
console.log(`S3 Access Key: ${process.env.S3_ACCESS_KEY_ID ? "SET" : "MISSING"}`);
console.log(`S3 Secret Key: ${process.env.S3_SECRET_ACCESS_KEY ? "SET" : "MISSING"}`);
console.log(`Slug mapping path: ${BOOKMARKS_S3_PATHS.SLUG_MAPPING}`);
console.log("");

async function diagnoseAndFix() {
  try {
    // Step 1: Check if slug mapping exists
    console.log("Step 1: Checking existing slug mapping...");
    const existingMapping = await loadSlugMapping();

    if (existingMapping) {
      console.log(`✓ Slug mapping exists with ${existingMapping.count} entries`);
      console.log(`  Version: ${existingMapping.version}`);
      console.log(`  Generated: ${existingMapping.generated}`);
      console.log(
        `  First 5 slugs:`,
        Object.values(existingMapping.slugs)
          .slice(0, 5)
          .map((e) => e.slug),
      );
    } else {
      console.warn("✗ No slug mapping found in S3");
    }

    // Step 2: Check if bookmarks data exists
    console.log("\nStep 2: Checking bookmarks data...");
    const bookmarksData = await readJsonS3<UnifiedBookmark[]>(BOOKMARKS_S3_PATHS.FILE);

    if (bookmarksData && bookmarksData.length > 0) {
      console.log(`✓ Found ${bookmarksData.length} bookmarks in S3`);
      const firstBookmark = bookmarksData[0];
      if (firstBookmark) {
        console.log(`  First bookmark ID: ${firstBookmark.id}`);
        console.log(`  First bookmark URL: ${firstBookmark.url}`);
      }
    } else {
      console.error("✗ No bookmarks data found in S3");
      console.error("  Cannot generate slug mapping without bookmarks data");
      return;
    }

    // Step 3: Regenerate slug mapping
    console.log("\nStep 3: Regenerating slug mapping...");
    const allBookmarks = (await getBookmarks({ includeImageData: false })) as UnifiedBookmark[];

    if (allBookmarks.length === 0) {
      console.error("✗ Failed to load bookmarks through service");
      return;
    }

    console.log(`Loaded ${allBookmarks.length} bookmarks through service`);

    // Step 4: Save new slug mapping
    console.log("\nStep 4: Saving new slug mapping...");
    await saveSlugMapping(allBookmarks);

    // Step 5: Verify the fix
    console.log("\nStep 5: Verifying the fix...");
    const newMapping = await loadSlugMapping();

    if (newMapping && newMapping.count === allBookmarks.length) {
      console.log(`✓ Successfully regenerated slug mapping with ${newMapping.count} entries`);
      console.log(`  Generated at: ${newMapping.generated}`);
      console.log("\n🎉 Fix completed successfully!");

      // Show some example URLs
      console.log("\nExample bookmark URLs that should now work:");
      const examples = Object.values(newMapping.slugs).slice(0, 5);
      for (const example of examples) {
        console.log(`  https://williamcallahan.com/bookmarks/${example.slug}`);
      }
    } else {
      console.error("✗ Failed to verify the new slug mapping");
    }
  } catch (error) {
    console.error("\n❌ Error during diagnosis/fix:", error);
    if (error instanceof Error) {
      console.error("  Message:", error.message);
      console.error("  Stack:", error.stack);
    }
  }
}

// Run the diagnosis and fix
diagnoseAndFix()
  .then(() => {
    console.log("\n=== Script completed ===");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n=== Script failed ===", error);
    process.exit(1);
  });
