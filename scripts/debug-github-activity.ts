#!/usr/bin/env bun

/**
 * Debug Script for GitHub Activity Data Issues
 * 
 * This script helps diagnose and fix GitHub Activity JSON issues by:
 * 1. Checking environment configuration
 * 2. Listing existing S3 files
 * 3. Validating data structure
 * 4. Attempting data refresh
 */

import { getEnvironment, getEnvironmentSuffix } from "@/lib/config/environment";
import { 
  readGitHubActivityFromS3,
  GITHUB_ACTIVITY_S3_KEY_FILE,
  GITHUB_ACTIVITY_S3_KEY_FILE_FALLBACK,
  ALL_TIME_SUMMARY_S3_KEY_FILE,
  GITHUB_STATS_SUMMARY_S3_KEY_FILE
} from "@/lib/data-access/github-storage";
import { listS3Objects } from "@/lib/s3-utils";
import { refreshGitHubActivityDataFromApi } from "@/lib/data-access/github";

async function main() {
  console.log("🔍 GitHub Activity Debug Script\n");
  console.log("=".repeat(50));
  
  // 1. Check environment configuration
  console.log("\n📋 Environment Configuration:");
  console.log(`  DEPLOYMENT_ENV: ${process.env.DEPLOYMENT_ENV || "(not set)"}`);
  console.log(`  NODE_ENV: ${process.env.NODE_ENV || "(not set)"}`);
  console.log(`  Detected Environment: ${getEnvironment()}`);
  console.log(`  Environment Suffix: "${getEnvironmentSuffix()}"`);
  console.log(`  Primary File: ${GITHUB_ACTIVITY_S3_KEY_FILE}`);
  console.log(`  Fallback File: ${GITHUB_ACTIVITY_S3_KEY_FILE_FALLBACK}`);
  
  // 2. List existing GitHub activity files in S3
  console.log("\n📁 S3 GitHub Activity Files:");
  try {
    const files = await listS3Objects("json/github-activity");
    if (files.length === 0) {
      console.log("  ❌ No files found in json/github-activity/");
    } else {
      for (const file of files.slice(0, 20)) {
        console.log(`  - ${file}`);
      }
      if (files.length > 20) {
        console.log(`  ... and ${files.length - 20} more files`);
      }
    }
  } catch (error) {
    console.error("  ❌ Error listing S3 files:", error);
  }
  
  // 3. Check primary file
  console.log("\n🔍 Checking Primary File:");
  console.log(`  File: ${GITHUB_ACTIVITY_S3_KEY_FILE}`);
  try {
    const primaryData = await readGitHubActivityFromS3(GITHUB_ACTIVITY_S3_KEY_FILE);
    if (primaryData) {
      const trailing = primaryData.trailingYearData;
      const allTime = primaryData.cumulativeAllTimeData;
      console.log(`  ✅ File exists`);
      console.log(`  - Trailing Year Contributions: ${trailing?.totalContributions ?? 0}`);
      console.log(`  - Trailing Year Data Points: ${trailing?.data?.length ?? 0}`);
      console.log(`  - Trailing Year Complete: ${trailing?.dataComplete ?? false}`);
      console.log(`  - All-Time Contributions: ${allTime?.totalContributions ?? 0}`);
      
      // Check for data inconsistencies
      if (trailing && allTime) {
        if (trailing.totalContributions > allTime.totalContributions) {
          console.log("  ⚠️  WARNING: Trailing year > All-time contributions!");
        }
      }
      if (trailing?.data?.length === 0 && trailing?.totalContributions > 0) {
        console.log("  ⚠️  WARNING: Has contributions but no data points!");
      }
    } else {
      console.log(`  ❌ File not found or empty`);
    }
  } catch (error) {
    console.log(`  ❌ Error reading file:`, error);
  }
  
  // 4. Check fallback file
  console.log("\n🔍 Checking Fallback File:");
  console.log(`  File: ${GITHUB_ACTIVITY_S3_KEY_FILE_FALLBACK}`);
  try {
    const fallbackData = await readGitHubActivityFromS3(GITHUB_ACTIVITY_S3_KEY_FILE_FALLBACK);
    if (fallbackData) {
      const trailing = fallbackData.trailingYearData;
      console.log(`  ✅ File exists`);
      console.log(`  - Trailing Year Contributions: ${trailing?.totalContributions ?? 0}`);
      console.log(`  - Trailing Year Data Points: ${trailing?.data?.length ?? 0}`);
    } else {
      console.log(`  ❌ File not found or empty`);
    }
  } catch (error) {
    console.log(`  ❌ Error reading file:`, error);
  }
  
  // 5. Check other summary files
  console.log("\n📊 Other Summary Files:");
  const summaryFiles = [
    { name: "Stats Summary", path: GITHUB_STATS_SUMMARY_S3_KEY_FILE },
    { name: "All-Time Summary", path: ALL_TIME_SUMMARY_S3_KEY_FILE }
  ];
  
  for (const file of summaryFiles) {
    console.log(`  ${file.name}: ${file.path}`);
    try {
      const exists = await listS3Objects(file.path);
      console.log(`    ${exists.length > 0 ? "✅ Exists" : "❌ Not found"}`);
    } catch {
      console.log(`    ❌ Error checking`);
    }
  }
  
  // 6. Ask if user wants to refresh
  console.log("\n" + "=".repeat(50));
  const args = process.argv.slice(2);
  if (args.includes("--refresh") || args.includes("-r")) {
    console.log("\n🔄 Refreshing GitHub Activity Data...");
    console.log("  This may take a few minutes...\n");
    
    try {
      const result = await refreshGitHubActivityDataFromApi();
      if (result) {
        console.log("✅ Refresh completed successfully!");
        console.log(`  - Trailing Year: ${result.trailingYearData.totalContributions} contributions`);
        console.log(`  - All-Time: ${result.allTimeData.totalContributions} contributions`);
        console.log(`  - Lines Added: +${result.trailingYearData.linesAdded || 0}`);
        console.log(`  - Lines Removed: -${result.trailingYearData.linesRemoved || 0}`);
      } else {
        console.log("❌ Refresh returned no data");
      }
    } catch (error) {
      console.error("❌ Refresh failed:", error);
      if (error instanceof Error && error.message.includes("rate")) {
        console.log("\n💡 Tip: GitHub API rate limit exceeded. Try again later.");
      }
    }
  } else {
    console.log("\n💡 To refresh GitHub data, run: bun scripts/debug-github-activity.ts --refresh");
  }
  
  // 7. Provide diagnostic summary
  console.log("\n" + "=".repeat(50));
  console.log("📋 Diagnostic Summary:\n");
  
  const suffix = getEnvironmentSuffix();
  
  if (!process.env.DEPLOYMENT_ENV) {
    console.log("⚠️  DEPLOYMENT_ENV is not set - this can cause environment detection issues");
    console.log("   Set DEPLOYMENT_ENV=development or DEPLOYMENT_ENV=production");
  }
  
  if (suffix && !GITHUB_ACTIVITY_S3_KEY_FILE.includes(suffix)) {
    console.log("⚠️  Environment suffix mismatch in file path");
    console.log(`   Expected suffix '${suffix}' not found in ${GITHUB_ACTIVITY_S3_KEY_FILE}`);
  }
  
  console.log("\n✅ Recommended Actions:");
  console.log("1. Ensure DEPLOYMENT_ENV is set consistently in CI/CD and runtime");
  console.log("2. Run data refresh: bun scripts/data-updater.ts --github --force");
  console.log("3. Check cron job configuration for automatic daily updates");
  console.log("4. Verify S3 bucket permissions for reading and writing");
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});