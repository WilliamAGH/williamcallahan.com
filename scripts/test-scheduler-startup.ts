#!/usr/bin/env bun

/**
 * Minimal test to verify scheduler can start
 * Run this to isolate scheduler startup issues
 */

export {}; // Make this a module to allow top-level await

console.log("[TEST] Starting scheduler startup test...");
console.log("[TEST] Current directory:", process.cwd());
console.log("[TEST] Node version:", process.version);
console.log("[TEST] Bun version:", process.versions.bun || "N/A");

// Test 1: Can we load the environment loader?
try {
  const { loadEnvironmentWithMultilineSupport } = await import("@/lib/utils/env-loader");
  loadEnvironmentWithMultilineSupport();
  console.log("[TEST] ✅ Environment loader loaded successfully");
} catch (error) {
  console.error("[TEST] ❌ Failed to load environment loader:", error);
  process.exit(1);
}

// Test 2: Can we import node-cron?
try {
  await import("node-cron");
  console.log("[TEST] ✅ node-cron loaded successfully");
} catch (error) {
  console.error("[TEST] ❌ Failed to load node-cron:", error);
  console.error("[TEST] Is node-cron installed? Check node_modules/node-cron");
  process.exit(1);
}

// Test 3: Can we access Node built-ins?
try {
  await import("node:crypto");
  await import("node:child_process");
  console.log("[TEST] ✅ Node built-ins loaded successfully");
} catch (error) {
  console.error("[TEST] ❌ Failed to load Node built-ins:", error);
  process.exit(1);
}

// Test 4: Can we create a simple cron job?
try {
  const cron = await import("node-cron");
  const testJob = cron.schedule(
    "*/10 * * * * *",
    () => {
      console.log("[TEST] Cron job triggered at", new Date().toISOString());
    },
    { scheduled: false },
  );

  console.log("[TEST] ✅ Test cron job created successfully");
  console.log("[TEST] Starting test job for 15 seconds...");

  testJob.start();

  setTimeout(() => {
    testJob.stop();
    console.log("[TEST] ✅ All tests passed! Scheduler should be able to start.");
    process.exit(0);
  }, 15000);
} catch (error) {
  console.error("[TEST] ❌ Failed to create test cron job:", error);
  process.exit(1);
}
