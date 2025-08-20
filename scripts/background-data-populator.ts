#!/usr/bin/env bun

/**
 * Background Data Populator
 * 
 * Monitors for initial data population needs and runs data updates
 * in the background after the server has started. This prevents blocking
 * the server startup with S3 operations.
 * 
 * @module scripts/background-data-populator
 */

import { existsSync, unlinkSync } from "node:fs";
import { spawn } from "node:child_process";
import logger from "@/lib/utils/logger";

const MARKER_FILE = "/tmp/needs-initial-data-population";
const CHECK_INTERVAL = 10000; // Check every 10 seconds
const INITIAL_DELAY = 30000; // Wait 30 seconds after server start

/**
 * Run the data updater script in a child process
 */
async function runDataUpdater(): Promise<void> {
  return new Promise((resolve, reject) => {
    logger.info("[BackgroundPopulator] Starting data updater process...");
    
    // Spawn the data updater as a child process
    const child = spawn("bun", ["scripts/data-updater.ts"], {
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

    child.on("close", (code) => {
      if (code === 0) {
        logger.info("[BackgroundPopulator] Data updater completed successfully");
        resolve();
      } else {
        logger.error(`[BackgroundPopulator] Data updater failed with exit code ${code}`);
        if (stderr) {
          logger.error(`[BackgroundPopulator] stderr: ${stderr}`);
        }
        reject(new Error(`Data updater exited with code ${code}`));
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
  if (!existsSync(MARKER_FILE)) {
    return;
  }

  logger.info("[BackgroundPopulator] Marker file detected - initial data population needed");
  
  try {
    // Remove the marker file immediately to prevent duplicate runs
    unlinkSync(MARKER_FILE);
    logger.info("[BackgroundPopulator] Removed marker file");
    
    // Run the data updater
    await runDataUpdater();
    
    logger.info("[BackgroundPopulator] Initial data population completed");
  } catch (error) {
    logger.error("[BackgroundPopulator] Failed to populate initial data:", error);
    // Don't recreate the marker file - we don't want to retry indefinitely
    // The scheduler will handle regular updates
  }
}

/**
 * Main monitoring loop
 */
async function main(): Promise<void> {
  logger.info("[BackgroundPopulator] Background data populator started");
  logger.info(`[BackgroundPopulator] Waiting ${INITIAL_DELAY / 1000}s for server to stabilize...`);
  
  // Wait for server to fully start and stabilize
  await new Promise(resolve => setTimeout(resolve, INITIAL_DELAY));
  
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

// Start the monitoring if run directly
if (import.meta.main) {
  main().catch((error) => {
    logger.error("[BackgroundPopulator] Fatal error:", error);
    process.exit(1);
  });
}