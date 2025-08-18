#!/usr/bin/env bun
/**
 * Fix S3 file naming to include environment suffix
 * This resolves the 404 issue where dev environment can't find its files
 *
 * Run with: bun scripts/fix-s3-env-suffix.ts
 */

import { readFromS3, writeToS3, listS3Objects } from "@/lib/s3-utils";
import { BOOKMARKS_S3_PATHS } from "@/lib/constants";

const env = process.env.NODE_ENV;
const envSuffix = env === "production" || !env ? "" : env === "test" ? "-test" : "-dev";

console.log("=== S3 Environment Suffix Fix ===");
console.log(`Current NODE_ENV: ${env || "(not set)"}`);
console.log(`Expected suffix: "${envSuffix}"`);
console.log("");

async function copyWithSuffix(sourceKey: string, targetKey: string) {
  try {
    console.log(`Copying ${sourceKey} -> ${targetKey}`);
    const content = await readFromS3(sourceKey);
    if (content) {
      await writeToS3(targetKey, content);
      console.log(`  ✓ Copied successfully`);
      return true;
    } else {
      console.log(`  ✗ Source file not found`);
      return false;
    }
  } catch (error) {
    console.error(`  ✗ Error: ${error}`);
    return false;
  }
}

async function fixEnvironmentSuffixes() {
  const baseFiles = [
    { base: "bookmarks.json", expected: BOOKMARKS_S3_PATHS.FILE },
    { base: "index.json", expected: BOOKMARKS_S3_PATHS.INDEX },
    { base: "slug-mapping.json", expected: BOOKMARKS_S3_PATHS.SLUG_MAPPING },
    { base: "heartbeat.json", expected: BOOKMARKS_S3_PATHS.HEARTBEAT },
  ];

  console.log("Files to fix:");
  for (const file of baseFiles) {
    console.log(`  ${file.base} -> ${file.expected}`);
  }
  console.log("");

  // List current files in S3
  console.log("Listing current S3 files in json/bookmarks/...");
  try {
    const objects = await listS3Objects("json/bookmarks/");
    if (objects && Array.isArray(objects)) {
      console.log(`Found ${objects.length} files:`);
      objects.slice(0, 20).forEach((key: string) => {
        console.log(`  - ${key}`);
      });
    }
  } catch (error) {
    console.error("Failed to list S3 objects:", error);
  }
  console.log("");

  // Fix the main files
  console.log("Fixing file names with environment suffix...");
  for (const file of baseFiles) {
    const sourcePath = `json/bookmarks/${file.base}`;
    const targetPath = file.expected;

    if (sourcePath !== targetPath) {
      await copyWithSuffix(sourcePath, targetPath);
    } else {
      console.log(`${sourcePath} -> already correct (production environment)`);
    }
  }

  // Handle paginated files
  console.log("\nFixing paginated files...");
  for (let i = 1; i <= 10; i++) {
    const sourcePagePath = `json/bookmarks/pages/page-${i}.json`;
    const targetPagePath = `${BOOKMARKS_S3_PATHS.PAGE_PREFIX}${i}.json`;

    if (sourcePagePath !== targetPagePath) {
      const success = await copyWithSuffix(sourcePagePath, targetPagePath);
      if (!success && i > 1) {
        // Stop if we can't find more pages
        break;
      }
    }
  }

  console.log("\n✅ Environment suffix fix completed!");
  console.log("\nNext steps:");
  console.log("1. Deploy the updated code to dev.williamcallahan.com");
  console.log("2. The bookmarks should now work with the correct file names");
  console.log("3. You may want to clean up the old files without suffixes later");
}

// Run the fix
fixEnvironmentSuffixes()
  .then(() => {
    console.log("\n=== Script completed ===");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n=== Script failed ===", error);
    process.exit(1);
  });
