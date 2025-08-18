#!/usr/bin/env bun
/**
 * Environment Validation Script
 *
 * Ensures environment is properly configured before builds and deployments.
 * This prevents S3 path mismatches that cause 404 errors.
 *
 * Run automatically before builds or manually with: bun scripts/validate-environment.ts
 */

import { getEnvironment, getEnvironmentSuffix } from "@/lib/config/environment";
import { BOOKMARKS_S3_PATHS, SEARCH_S3_PATHS } from "@/lib/constants";

console.log("=== Environment Validation ===\n");

// Get current environment
const env = getEnvironment();
const suffix = getEnvironmentSuffix();
const nodeEnv = process.env.NODE_ENV;

// Check if NODE_ENV is set
if (!nodeEnv) {
  console.error("❌ NODE_ENV is not set!");
  console.error("   This will cause S3 path mismatches and 404 errors.");
  console.error("   Set NODE_ENV=development|production|test before running.");
  process.exit(1);
}

// Log current configuration
console.log("Current Configuration:");
console.log(`  NODE_ENV (raw): ${nodeEnv}`);
console.log(`  Environment (normalized): ${env}`);
console.log(`  Path suffix: "${suffix}"`);
console.log("");

// Validate critical S3 paths
console.log("Validating S3 Paths:");

const pathsToCheck = [
  { name: "Bookmarks", path: BOOKMARKS_S3_PATHS.FILE },
  { name: "Bookmarks Index", path: BOOKMARKS_S3_PATHS.INDEX },
  { name: "Slug Mapping", path: BOOKMARKS_S3_PATHS.SLUG_MAPPING },
  { name: "Heartbeat", path: BOOKMARKS_S3_PATHS.HEARTBEAT },
  { name: "Search Index", path: SEARCH_S3_PATHS.POSTS_INDEX },
];

let hasErrors = false;

for (const { name, path } of pathsToCheck) {
  const expectedSuffix = suffix ? `${suffix}.json` : ".json";
  const hasCorrectSuffix = path.endsWith(expectedSuffix);

  if (hasCorrectSuffix) {
    console.log(`  ✅ ${name}: ${path}`);
  } else {
    console.error(`  ❌ ${name}: ${path}`);
    console.error(`     Expected to end with: ${expectedSuffix}`);
    hasErrors = true;
  }
}

console.log("");

// Check for common issues
console.log("Checking for Common Issues:");

// Issue 1: Production environment with dev/test suffix
if (env === "production" && (suffix === "-dev" || suffix === "-test")) {
  console.error("❌ Production environment should not have a suffix!");
  hasErrors = true;
} else {
  console.log("✅ Environment suffix matches environment type");
}

// Issue 2: Non-production without suffix
if (env !== "production" && suffix === "") {
  console.error("❌ Non-production environment should have a suffix!");
  console.error(`   Expected suffix for ${env}: ${env === "test" ? "-test" : "-dev"}`);
  hasErrors = true;
} else if (env !== "production") {
  console.log("✅ Non-production environment has appropriate suffix");
}

// Issue 3: Mismatch between NODE_ENV and expected suffix
const expectedSuffixForEnv = env === "production" ? "" : env === "test" ? "-test" : "-dev";
if (suffix !== expectedSuffixForEnv) {
  console.error(
    `❌ Suffix mismatch! Environment '${env}' should use suffix '${expectedSuffixForEnv}' but got '${suffix}'`,
  );
  hasErrors = true;
}

console.log("");

// Final result
if (hasErrors) {
  console.error("❌ Environment validation failed!");
  console.error("   Fix the issues above before proceeding.");
  console.error("\nSuggested fixes:");
  console.error("  - For development: export NODE_ENV=development");
  console.error("  - For production: export NODE_ENV=production");
  console.error("  - For testing: export NODE_ENV=test");
  process.exit(1);
} else {
  console.log("✅ Environment validation passed!");
  console.log("   S3 paths will be created with correct suffixes.");

  // Show what files will be created
  console.log("\nFiles that will be created in S3:");
  console.log(`  - bookmarks${suffix}.json`);
  console.log(`  - index${suffix}.json`);
  console.log(`  - slug-mapping${suffix}.json`);
  console.log(`  - heartbeat${suffix}.json`);
  console.log(`  - pages${suffix}/page-*.json`);
  console.log(`  - tags${suffix}/*/page-*.json`);
}

console.log("\n=== Validation Complete ===");
process.exit(0);
