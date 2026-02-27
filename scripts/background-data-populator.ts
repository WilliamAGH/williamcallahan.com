#!/usr/bin/env tsx

/**
 * Background Data Populator
 *
 * Monitors for initial data population needs and runs data updates
 * in the background after the server has started. This prevents blocking
 * the server startup with S3 operations.
 *
 * @module scripts/background-data-populator
 */

import { existsSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import logger from "@/lib/utils/logger";

const MARKER_FILE = "/tmp/needs-initial-data-population";
const CHECK_INTERVAL = 10000; // Check every 10 seconds
const INITIAL_DELAY = 30000; // Wait 30 seconds after server start
const MAX_POPULATION_ATTEMPTS = 3; // Prevent infinite retry loops
let populationAttempts = 0;
let isRunning = false;
const MAIN_MODULE_PATH = fileURLToPath(import.meta.url);

const isMainModule = (): boolean => {
  const invokedPath = process.argv[1];
  if (!invokedPath) {
    return false;
  }

  return resolve(invokedPath) === resolve(MAIN_MODULE_PATH);
};

/**
 * Run the data updater script in a child process
 * Rejects if the updater exits non-zero so failures surface to the caller.
 */
async function runDataUpdater(): Promise<void> {
  return new Promise((resolve, reject) => {
    logger.info("[BackgroundPopulator] Starting data updater process...");

    // Spawn the data updater as a child process using npx tsx for Node.js TLS compatibility
    const child = spawn("npx", ["tsx", "scripts/data-updater.ts"], {
      env: {
        ...process.env,
        IS_DATA_UPDATER: "true",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";

    child.stdout?.on("data", (data) => {
      const output = data.toString();
      // Log important lines in real-time
      if (output.includes("✅") || output.includes("❌") || output.includes("Summary")) {
        console.log(`[DataUpdater] ${output.trim()}`);
      }
    });

    child.stderr?.on("data", (data) => {
      const output = data.toString();
      stderr += output;
      console.error(`[DataUpdater ERROR] ${output.trim()}`);
    });

    child.on("close", (code, signal) => {
      if (code === 0) {
        logger.info("[BackgroundPopulator] Data updater completed successfully");
        resolve();
      } else {
        const exitReason = signal ? `signal ${signal}` : `exit code ${code}`;
        logger.error(`[BackgroundPopulator] Data updater failed with ${exitReason}`);
        if (stderr) {
          logger.error(`[BackgroundPopulator] stderr: ${stderr}`);
        }
        const details = stderr ? `\n${stderr}` : "";
        reject(new Error(`Data updater exited with ${exitReason}.${details}`));
      }
    });

    child.on("error", (error) => {
      logger.error("[BackgroundPopulator] Failed to start data updater:", error);
      reject(error);
    });
  });
}

/**
 * Check for the marker file and run data population if needed
 */
async function checkAndPopulate(): Promise<void> {
  if (isRunning || !existsSync(MARKER_FILE)) {
    return;
  }

  if (populationAttempts >= MAX_POPULATION_ATTEMPTS) {
    logger.error(
      `[BackgroundPopulator] Max attempts (${MAX_POPULATION_ATTEMPTS}) reached; removing marker and giving up`,
    );
    rmSync(MARKER_FILE, { force: true });
    return;
  }

  populationAttempts++;
  isRunning = true;
  logger.info(
    `[BackgroundPopulator] Marker file detected - attempt ${populationAttempts}/${MAX_POPULATION_ATTEMPTS}`,
  );

  try {
    // Run the data updater first; only remove marker on success
    await runDataUpdater();

    // Success — remove marker so subsequent checks don't re-trigger
    rmSync(MARKER_FILE, { force: true });
    logger.info("[BackgroundPopulator] Initial data population completed, marker removed");
  } catch (error) {
    logger.error("[BackgroundPopulator] Failed to populate initial data:", error);
    // Leave marker in place so the next interval check retries (up to MAX_POPULATION_ATTEMPTS)
  } finally {
    isRunning = false;
  }
}

/**
 * Main monitoring loop
 */
async function main(): Promise<void> {
  logger.info("[BackgroundPopulator] Background data populator started");
  logger.info(`[BackgroundPopulator] Waiting ${INITIAL_DELAY / 1000}s for server to stabilize...`);

  // Wait for server to fully start and stabilize
  await new Promise((resolve) => setTimeout(resolve, INITIAL_DELAY));

  logger.info("[BackgroundPopulator] Beginning monitoring for data population needs");

  // Check immediately
  await checkAndPopulate();

  // Then check periodically (in case the marker file is created later)
  const interval = setInterval(async () => {
    await checkAndPopulate();
  }, CHECK_INTERVAL);

  // Handle graceful shutdown
  process.on("SIGTERM", () => {
    logger.info("[BackgroundPopulator] Received SIGTERM, shutting down");
    clearInterval(interval);
    process.exit(0);
  });

  process.on("SIGINT", () => {
    logger.info("[BackgroundPopulator] Received SIGINT, shutting down");
    clearInterval(interval);
    process.exit(0);
  });
}

// Start the monitoring if run directly.
if (isMainModule()) {
  main().catch((error) => {
    logger.error("[BackgroundPopulator] Fatal error:", error);
    process.exit(1);
  });
}
