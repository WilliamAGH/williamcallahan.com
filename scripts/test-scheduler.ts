#!/usr/bin/env bun

/**
 * Test Script for Scheduler Functionality
 *
 * This script helps diagnose scheduler issues by:
 * 1. Checking environment variables
 * 2. Testing S3 connectivity
 * 3. Testing bookmark API connectivity
 * 4. Manually triggering a bookmark refresh
 * 5. Verifying the complete execution path
 */

import { loadEnvironmentWithMultilineSupport } from "@/lib/utils/env-loader";
loadEnvironmentWithMultilineSupport();

console.log("=== SCHEDULER DIAGNOSTIC TEST ===\n");

// Step 1: Check critical environment variables
console.log("1. ENVIRONMENT VARIABLES CHECK:");
const requiredVars = {
  S3_BUCKET: process.env.S3_BUCKET,
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
  BOOKMARKS_LIST_ID: process.env.BOOKMARKS_LIST_ID,
  BOOKMARK_BEARER_TOKEN: process.env.BOOKMARK_BEARER_TOKEN,
  BOOKMARKS_API_URL: process.env.BOOKMARKS_API_URL || "https://karakeep.com/api",
};

let allVarsSet = true;
for (const [key, value] of Object.entries(requiredVars)) {
  if (key.includes("SECRET") || key.includes("TOKEN")) {
    console.log(`  ${key}: ${value ? "✅ SET" : "❌ NOT SET"}`);
  } else {
    console.log(`  ${key}: ${value || "❌ NOT SET"}`);
  }
  if (!value && !key.includes("API_URL")) {
    allVarsSet = false;
  }
}

if (!allVarsSet) {
  console.log("\n❌ Missing required environment variables. Scheduler cannot function properly.");
  console.log("   Please set all required variables in your deployment environment.\n");
  process.exit(1);
}

console.log("\n✅ All required environment variables are set.\n");

// Step 2: Test S3 connectivity
console.log("2. S3 CONNECTIVITY TEST:");
try {
  const { readJsonS3 } = await import("@/lib/s3-utils");
  const { BOOKMARKS_S3_PATHS } = await import("@/lib/constants");

  console.log("  Testing S3 read access...");
  const index = await readJsonS3(BOOKMARKS_S3_PATHS.INDEX);
  if (index) {
    console.log(`  ✅ S3 read successful. Found bookmarks index.`);
  } else {
    console.log(`  ⚠️  No bookmarks index found in S3 (may be first run).`);
  }
} catch (error) {
  console.log(`  ❌ S3 connectivity failed: ${error}`);
  console.log("     Check S3 credentials and bucket configuration.\n");
  process.exit(1);
}

console.log("\n3. BOOKMARK API CONNECTIVITY TEST:");
try {
  const apiUrl = `${requiredVars.BOOKMARKS_API_URL}/lists/${requiredVars.BOOKMARKS_LIST_ID}/bookmarks`;
  console.log(`  Testing API: ${apiUrl}`);

  const response = await fetch(apiUrl, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${requiredVars.BOOKMARK_BEARER_TOKEN}`,
    },
    signal: AbortSignal.timeout(5000),
  });

  if (response.ok) {
    const data = await response.json();
    console.log(
      `  ✅ API connection successful. Response has ${data.bookmarks?.length || 0} bookmarks.`,
    );
  } else {
    console.log(`  ❌ API returned error: ${response.status} ${response.statusText}`);
    process.exit(1);
  }
} catch (error) {
  console.log(`  ❌ API connectivity failed: ${error}`);
  console.log("     Check API URL and bearer token.\n");
  process.exit(1);
}

console.log("\n4. MANUAL BOOKMARK REFRESH TEST:");
console.log("  Triggering manual bookmark refresh...");
console.log("  This simulates what the scheduler would do...\n");

try {
  const { spawn } = await import("node:child_process");

  const updateProcess = spawn("bun", ["run", "update-s3", "--", "--bookmarks"], {
    env: process.env,
    stdio: "inherit",
  });

  updateProcess.on("error", (err) => {
    console.error(`  ❌ Failed to start update process: ${err}`);
    process.exit(1);
  });

  updateProcess.on("close", (code) => {
    if (code === 0) {
      console.log("\n✅ SCHEDULER TEST SUCCESSFUL!");
      console.log("   The scheduler should work correctly with these settings.");
      console.log("   If scheduled updates still don't work, check:");
      console.log("   - Container logs for scheduler startup issues");
      console.log("   - Whether the scheduler process stays alive");
      console.log("   - Timezone settings (should be America/Los_Angeles)");
    } else {
      console.log(`\n❌ Update process failed with code ${code}`);
      console.log("   Check the error messages above for details.");
    }
    process.exit(code || 0);
  });
} catch (error) {
  console.log(`  ❌ Test failed: ${error}`);
  process.exit(1);
}
