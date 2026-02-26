#!/usr/bin/env bun
/**
 * Environment Validation Script
 *
 * Ensures environment is properly configured before builds and deployments.
 * This prevents environment drift for PostgreSQL-backed content pipelines.
 *
 * Run automatically before builds or manually with: bun scripts/validate-environment.ts
 */

import { getEnvironment, getEnvironmentSuffix } from "@/lib/config/environment";

console.log("=== Environment Validation ===\n");

// Get current environment
const env = getEnvironment();
const suffix = getEnvironmentSuffix();
const nodeEnv = process.env.NODE_ENV;

// Check if NODE_ENV is set
if (!nodeEnv) {
  console.error("❌ NODE_ENV is not set!");
  console.error("   This causes environment resolution drift across runtime modules.");
  console.error("   Set NODE_ENV=development|production|test before running.");
  process.exit(1);
}

// Log current configuration
console.log("Current Configuration:");
console.log(`  NODE_ENV (raw): ${nodeEnv}`);
console.log(`  Environment (normalized): ${env}`);
console.log(`  Path suffix: "${suffix}"`);
console.log("");

let hasErrors = false;

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set.");
  console.error("   PostgreSQL is the canonical persistence layer for JSON-backed site data.");
  hasErrors = true;
} else {
  console.log("✅ DATABASE_URL is set");
}

if (!process.env.S3_BUCKET) {
  console.error("❌ S3_BUCKET is not set.");
  console.error("   S3 is still required for binary asset storage.");
  hasErrors = true;
} else {
  console.log("✅ S3_BUCKET is set");
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
  console.log("   Environment is consistent with PostgreSQL-first data persistence.");

  console.log("\nPersistence model:");
  console.log("  - PostgreSQL: canonical JSON/search/content data");
  console.log("  - S3: binary assets (images, uploads, generated files)");
}

console.log("\n=== Validation Complete ===");
process.exit(0);
