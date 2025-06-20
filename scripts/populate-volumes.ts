#!/usr/bin/env ts-node

/**
 * DIRECT VOLUME POPULATION SCRIPT
 *
 * This script uses the centralized data-access layer to populate data volumes
 */

import fs from "node:fs/promises";
import path from "node:path";
import { KNOWN_DOMAINS } from "../lib/constants";
import {
  calculateAndStoreAggregatedWeeklyActivity,
  getBookmarks,
  getGithubActivity,
  getInvestmentDomainsAndIds,
  getLogo,
} from "../lib/data-access";
import { getOpenGraphData } from "../lib/data-access/opengraph";
import { debug } from "../lib/utils/debug";
import { isValidImageUrl } from "../lib/utils/opengraph-utils";
import type { UnifiedBookmark } from "../types/bookmark";
import type { UserActivityView } from "../types/github"; // Import UserActivityView

// CONFIG
// Default to `false` when the env-var is absent
const VERBOSE = process.env.VERBOSE === "true";
const LAST_RUN_SUCCESS_TIMESTAMP_FILE = path.join(process.cwd(), ".populate-volumes-last-run-success");
const RUN_INTERVAL_HOURS = 12;

// Argument parsing
const args = process.argv.slice(2); // Exclude 'node' and script path
const forceRefreshGithub = args.includes("--force-refresh-github");

// DATA VOLUME PATHS (Primarily for createDirectories, actual paths are in data-access)
const ROOT_DIR = process.cwd();
const DATA_DIR = path.join(ROOT_DIR, "data");
const BOOKMARKS_DIR = path.join(DATA_DIR, "bookmarks");
const GITHUB_DATA_DIR = path.join(DATA_DIR, "github-activity");
const IMAGES_DIR = path.join(DATA_DIR, "images");
const LOGOS_DIR = path.join(IMAGES_DIR, "logos");
const REPO_RAW_WEEKLY_STATS_DIR = path.join(GITHUB_DATA_DIR, "repo_raw_weekly_stats");
const BOOKMARK_IMAGES_DIR = path.join(IMAGES_DIR, "bookmarks");

// Create all required directories (data-access layer also ensures directories)
async function createDirectories() {
  console.log("🔧 Ensuring all necessary data directories exist...");
  await fs.mkdir(BOOKMARKS_DIR, { recursive: true });
  await fs.mkdir(GITHUB_DATA_DIR, { recursive: true });
  await fs.mkdir(REPO_RAW_WEEKLY_STATS_DIR, { recursive: true });
  await fs.mkdir(IMAGES_DIR, { recursive: true });
  await fs.mkdir(LOGOS_DIR, { recursive: true });
  await fs.mkdir(BOOKMARK_IMAGES_DIR, { recursive: true });
  console.log("✅ All necessary data directories ensured by populate-volumes.ts.");
}

async function populateBookmarksData() {
  console.log("📚 Populating bookmarks volume using data-access layer...");
  const bookmarks = await getBookmarks(); // This now handles fetch, volume write, cache
  if (bookmarks) {
    console.log(`✅ Bookmarks volume populated/updated. Total: ${bookmarks.length}`);
    return bookmarks;
  }
  console.error("❌ Failed to populate bookmarks volume via data-access layer.");
  return [];
}

async function populateGithubActivityData() {
  console.log("🐙 Populating GitHub activity volume using data-access layer...");
  const activity: UserActivityView = await getGithubActivity(); // Type annotation to UserActivityView

  // getGithubActivity now returns a UserActivityView object, never null.
  // It includes an `error` field if something went wrong.
  if (activity.error) {
    console.error(`❌ Failed to populate GitHub activity volume: ${activity.error}`);
    // Depending on severity, you might want to return activity or null
    // For now, we'll return the activity object as it contains error info and default data structures.
    return activity;
  }

  // trailingYearData is now guaranteed to be an object.
  console.log(
    `✅ GitHub activity volume populated/updated. Source: ${activity.source}, Trailing year data complete: ${activity.trailingYearData.dataComplete}`,
  );

  // Only call calculateAndStoreAggregatedWeeklyActivity if the primary data fetch was successful
  if (activity.source === "s3-store" || activity.source === "api-fallback") {
    // Or other success states
    try {
      await calculateAndStoreAggregatedWeeklyActivity();
      console.log("✅ Aggregated weekly GitHub activity calculated and stored.");
    } catch (aggError: unknown) {
      console.error("❌ Failed to calculate and store aggregated weekly GitHub activity:", aggError);
    }
  }
  return activity;
}

async function populateLogosData(bookmarks: UnifiedBookmark[]) {
  console.log("🖼️ Populating logos volume using data-access layer...");
  const domains = new Set<string>();
  const domainToIdMap = new Map<string, string>(); // Still useful for ID mapping if getLogo needs it

  // 1. Extract domains from bookmarks
  if (bookmarks && bookmarks.length > 0) {
    console.log(`📊 Extracting domains from ${bookmarks.length} bookmarks...`);
    for (const bookmark of bookmarks) {
      try {
        if (bookmark.url) {
          const url = new URL(bookmark.url);
          const domain = url.hostname.replace(/^www\./, "");
          domains.add(domain);
          if (bookmark.id) domainToIdMap.set(domain, bookmark.id);
        }
      } catch (error: unknown) {
        if (VERBOSE) {
          const message = error instanceof Error ? error.message : String(error);
          console.log(`⚠️ Could not parse URL for logo: ${bookmark.url || "undefined"}. Error: ${message}`);
        }
      }
    }
  }

  // 2. Extract domains from investments data (using data-access)
  console.log("🔍 Fetching investment domains via data-access layer...");
  const investmentDomainsMap = await getInvestmentDomainsAndIds();
  investmentDomainsMap.forEach((id: string, domain: string) => {
    // Added types for id and domain
    domains.add(domain);
    if (!domainToIdMap.has(domain)) domainToIdMap.set(domain, id);
  });
  console.log(`✅ Added ${investmentDomainsMap.size} unique domains from investments.`);

  // 3. Extract domains from experience data (simplified, as data-access doesn't have this yet)
  // Extract experience domains using local file parsing
  try {
    const experienceContent = await fs.readFile(path.join(ROOT_DIR, "data", "experience.ts"), "utf-8");
    let currentId: string | null = null;
    const experienceBlocks = experienceContent.split(/^\s*{\s*(?:"|')id(?:"|'):/m);
    for (let i = 1; i < experienceBlocks.length; i++) {
      const block = experienceBlocks[i];
      if (block) {
        const idMatch = block.match(/^(?:"|')([^"']+)(?:"|')/);
        if (idMatch?.[1]) {
          currentId = idMatch[1];
          const urlPatterns = [
            /companyUrl:\s*['"](?:https?:\/\/)?(?:www\.)?([^/'"]+)['"]/g,
            /url:\s*['"](?:https?:\/\/)?(?:www\.)?([^/'"]+)['"]/g,
            /website:\s*['"](?:https?:\/\/)?(?:www\.)?([^/'"]+)['"]/g,
          ];
          for (const pattern of urlPatterns) {
            let urlMatch: RegExpExecArray | null;
            urlMatch = pattern.exec(block);
            while (urlMatch !== null) {
              if (urlMatch && typeof urlMatch[1] === "string") {
                const domain = urlMatch[1];
                domains.add(domain);
                if (!domainToIdMap.has(domain) && currentId) {
                  domainToIdMap.set(domain, currentId);
                }
              }
              urlMatch = pattern.exec(block);
            }
          }
        }
      }
    }
    console.log(`📊 Extracted additional domains from experience.ts. Total unique: ${domains.size}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`⚠️ Could not read/parse experience.ts for domains. Error: ${message}`);
  }

  // 4. Extract domains from education data (simplified)
  try {
    const educationContent = await fs.readFile(path.join(ROOT_DIR, "data", "education.ts"), "utf-8");
    let currentId: string | null = null;
    const educationBlocks = educationContent.split(/^\s*{\s*(?:"|')id(?:"|'):/m);
    for (let i = 1; i < educationBlocks.length; i++) {
      const block = educationBlocks[i];
      if (block) {
        const idMatch = block.match(/^(?:"|')([^"']+)(?:"|')/);
        if (idMatch?.[1]) {
          currentId = idMatch[1];
          const urlPatterns = [
            /institutionUrl:\s*['"](?:https?:\/\/)?(?:www\.)?([^/'"]+)['"]/g,
            /url:\s*['"](?:https?:\/\/)?(?:www\.)?([^/'"]+)['"]/g,
            /website:\s*['"](?:https?:\/\/)?(?:www\.)?([^/'"]+)['"]/g,
          ];
          for (const pattern of urlPatterns) {
            let urlMatch: RegExpExecArray | null;
            urlMatch = pattern.exec(block);
            while (urlMatch !== null) {
              if (urlMatch && typeof urlMatch[1] === "string") {
                const domain = urlMatch[1];
                domains.add(domain);
                if (!domainToIdMap.has(domain) && currentId) {
                  domainToIdMap.set(domain, currentId);
                }
              }
              urlMatch = pattern.exec(block);
            }
          }
        }
      }
    }
    console.log(`📊 Extracted additional domains from education.ts. Total unique: ${domains.size}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`⚠️ Could not read/parse education.ts for domains. Error: ${message}`);
  }

  // 5. Add hardcoded domains from centralized constant
  for (const domain of KNOWN_DOMAINS) {
    domains.add(domain);
  }
  console.log(
    `[Prefetch] Added ${KNOWN_DOMAINS.length} hardcoded domains. Total unique domains for logos: ${domains.size}`,
  );

  const domainArray = Array.from(domains);
  let successCount = 0;
  let failureCount = 0;
  const BATCH_SIZE = 10; // Process in batches

  for (let i = 0; i < domainArray.length; i += BATCH_SIZE) {
    const batch = domainArray.slice(i, i + BATCH_SIZE);
    console.log(
      `⏳ Processing logo batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(domainArray.length / BATCH_SIZE)} for ${batch.length} domains`,
    );

    // Process domains sequentially within each batch to prevent memory overload
    for (const domain of batch) {
      try {
        // Check memory pressure before processing each logo
        const { ImageMemoryManagerInstance } = await import("@/lib/image-memory-manager");
        const metrics = ImageMemoryManagerInstance.getMetrics();

        // Skip processing if in memory pressure mode
        if (metrics.memoryPressure) {
          console.log(`⚠️ Skipping logo for ${domain} - memory pressure detected`);
          failureCount++;
          continue;
        }

        // getLogo handles fetching, validation (if possible), and writing to volume.
        const logoResult = await getLogo(domain); // Removed placeholder baseUrl
        if (logoResult && (logoResult.buffer || logoResult.s3Key || logoResult.url)) {
          console.log(`✅ Logo processed for ${domain} via data-access (source: ${logoResult.source})`);
          successCount++;
        } else {
          console.log(`⚠️ Could not fetch/process logo for ${domain} via data-access.`);
          failureCount++;
        }

        // Small delay between individual logos to allow garbage collection
        await new Promise((r) => setTimeout(r, 100));
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`❌ Error processing logo for ${domain} via data-access:`, message);
        failureCount++;
      }
    }

    if (i + BATCH_SIZE < domainArray.length) {
      console.log("⏱️ Waiting 500ms before next logo batch...");
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  console.log(`📊 Logo population summary: ${successCount} succeeded, ${failureCount} failed.`);
}

async function populateOpenGraphImages(bookmarks: UnifiedBookmark[]) {
  console.log("🖼️ Populating OpenGraph images using data-access layer...");

  if (!bookmarks || bookmarks.length === 0) {
    console.log("⚠️ No bookmarks available for OpenGraph image processing.");
    return;
  }

  let processedCount = 0;
  let successCount = 0;
  let failureCount = 0;
  const BATCH_SIZE = 5; // Smaller batch size for OpenGraph to be respectful to external services

  const bookmarksWithUrls = bookmarks.filter((bookmark) => bookmark.url);
  console.log(`📊 Processing OpenGraph images for ${bookmarksWithUrls.length} bookmarks with URLs...`);

  for (let i = 0; i < bookmarksWithUrls.length; i += BATCH_SIZE) {
    const batch = bookmarksWithUrls.slice(i, i + BATCH_SIZE);
    console.log(
      `⏳ Processing OpenGraph batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(bookmarksWithUrls.length / BATCH_SIZE)} for ${batch.length} bookmarks`,
    );

    // Process bookmarks sequentially within each batch to prevent memory overload
    for (const bookmark of batch) {
      processedCount++;
      try {
        // Check memory pressure before processing each OpenGraph image
        const { ImageMemoryManagerInstance } = await import("@/lib/image-memory-manager");
        const metrics = ImageMemoryManagerInstance.getMetrics();

        // Skip processing if in memory pressure mode
        if (metrics.memoryPressure) {
          console.log(`⚠️ Skipping OpenGraph for ${bookmark.url} - memory pressure detected`);
          failureCount++;
          continue;
        }

        console.log(`[${processedCount}/${bookmarksWithUrls.length}] Processing OpenGraph for: ${bookmark.url}`);

        // Call getOpenGraphData with bookmark ID as idempotency key
        const ogData = await getOpenGraphData(bookmark.url, false, bookmark.id);

        if (ogData && isValidImageUrl(ogData.imageUrl) && !ogData.error) {
          console.log(`✅ OpenGraph image processed for ${bookmark.url} (source: ${ogData.source})`);
          successCount++;
        } else {
          // Use debug logging for sites without images (common case)
          if (!ogData?.error && !isValidImageUrl(ogData?.imageUrl)) {
            debug(`ℹ️ No OpenGraph image available for ${bookmark.url}`);
          } else if (ogData?.error) {
            // Log actual errors with more detail
            if (ogData.error.includes("too large")) {
              console.log(`⚠️ OpenGraph extraction limited for ${bookmark.url}: Large HTML page, partial parsing used`);
            } else {
              console.log(`⚠️ Could not process OpenGraph image for ${bookmark.url}. Error: ${ogData.error}`);
            }
          } else {
            debug(`ℹ️ OpenGraph processed but no image found for ${bookmark.url}`);
          }
          failureCount++;
        }

        // Small delay between individual images to allow garbage collection
        await new Promise((r) => setTimeout(r, 200));
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`❌ Error processing OpenGraph for ${bookmark.url}:`, message);
        failureCount++;
      }
    }

    if (i + BATCH_SIZE < bookmarksWithUrls.length) {
      console.log("⏱️ Waiting 1000ms before next OpenGraph batch...");
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  console.log(`📊 OpenGraph images summary: ${successCount} succeeded, ${failureCount} failed.`);
}

// MAIN EXECUTION FUNCTION
async function populateAllVolumes() {
  console.log(`[Debug] Script execution started. Current working directory: ${process.cwd()}`);
  console.log(`[Debug] NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`[Debug] CI: ${process.env.CI}`);
  console.log(`[Debug] LAST_RUN_SUCCESS_TIMESTAMP_FILE path: ${LAST_RUN_SUCCESS_TIMESTAMP_FILE}`);
  if (forceRefreshGithub) {
    console.log(
      "ℹ️ --force-refresh-github flag provided. Preparing to delete existing GitHub data and skip timestamp check.",
    );
  }

  // Timestamp check for local development to avoid running too frequently
  if (process.env.NODE_ENV === "development" && process.env.CI !== "true") {
    // Only apply this logic in non-production, non-CI environments
    console.log(
      '[Debug] Condition for timestamp check met (NODE_ENV is "development" and CI is not "true"). Attempting timestamp check.',
    );
    console.log(`[Debug] LAST_RUN_SUCCESS_TIMESTAMP_FILE path: ${LAST_RUN_SUCCESS_TIMESTAMP_FILE}`);
    try {
      const stats = await fs.stat(LAST_RUN_SUCCESS_TIMESTAMP_FILE).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`[Debug] fs.stat error: ${message}. File might not exist or is inaccessible.`);
        return null;
      });
      if (stats) {
        console.log(
          `[Debug] fs.stat successful. File mtimeMs: ${stats.mtimeMs} (corresponds to ${new Date(stats.mtimeMs).toISOString()})`,
        );
        const lastRunTime = stats.mtimeMs;
        const currentTime = Date.now();
        console.log(
          `[Debug] Current time (Date.now()): ${currentTime} (corresponds to ${new Date(currentTime).toISOString()})`,
        );
        const hoursSinceLastRun = (currentTime - lastRunTime) / (1000 * 60 * 60);
        console.log(`[Debug] Calculated hoursSinceLastRun: ${hoursSinceLastRun}`);
        console.log(`[Debug] RUN_INTERVAL_HOURS: ${RUN_INTERVAL_HOURS}`);
        if (hoursSinceLastRun < RUN_INTERVAL_HOURS) {
          console.log(
            `✅ Populate-volumes script ran successfully within the last ${RUN_INTERVAL_HOURS} hours. Skipping full run.`,
          );
          process.exit(0);
        } else {
          console.log(
            "[Debug] Timestamp check: hoursSinceLastRun is not less than RUN_INTERVAL_HOURS. Proceeding with full run.",
          );
        }
      } else {
        console.log(
          "[Debug] fs.stat returned null (or caught error). File stats not available. Proceeding with full run.",
        );
      }
    } catch (error: unknown) {
      // Ignore errors reading the timestamp file (e.g., if it doesn't exist on first run)
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`[Debug] Error during timestamp check logic: ${errorMessage}. Proceeding with volume population.`);
      console.log("ℹ️ No recent successful run timestamp found, proceeding with volume population.");
    }
  } else {
    console.log(
      "[Debug] Condition for timestamp check NOT met. Skipping timestamp check and proceeding with full run.",
    );
  }

  console.log("🚀 STARTING DIRECT VOLUME POPULATION (using data-access layer)");
  console.log("-".repeat(50));
  const startTime = new Date().toISOString();
  console.log(`📆 Start time: ${startTime}`);

  if (forceRefreshGithub) {
    console.log("⚠️ --force-refresh-github: Deleting existing GitHub activity data before re-populating...");
    const activityDataFile = path.join(GITHUB_DATA_DIR, "activity_data.json");
    const aggregatedActivityFile = path.join(GITHUB_DATA_DIR, "aggregated_weekly_activity.json");
    // Note: REPO_RAW_WEEKLY_STATS_DIR is already defined globally

    try {
      // Delete individual files
      for (const file of [activityDataFile, aggregatedActivityFile]) {
        try {
          await fs.unlink(file);
          console.log(`🗑️ Deleted ${file}`);
        } catch (err: unknown) {
          const code = (err as { code?: string })?.code;
          const message = err instanceof Error ? err.message : String(err);
          if (code !== "ENOENT") {
            console.warn(`⚠️ Could not delete ${file}: ${message}`);
          } else {
            debug(`ℹ️ File not found, skipping deletion: ${file}`);
          }
        }
      }

      // Delete contents of repo_raw_weekly_stats directory
      try {
        const filesInRepoStatsDir = await fs.readdir(REPO_RAW_WEEKLY_STATS_DIR);
        for (const file of filesInRepoStatsDir) {
          await fs.unlink(path.join(REPO_RAW_WEEKLY_STATS_DIR, file));
        }
        if (filesInRepoStatsDir.length > 0) {
          console.log(`🗑️ Cleared ${filesInRepoStatsDir.length} files from ${REPO_RAW_WEEKLY_STATS_DIR}`);
        } else {
          debug(`ℹ️ No files found in ${REPO_RAW_WEEKLY_STATS_DIR}, skipping clearing.`);
        }
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        const message = err instanceof Error ? err.message : String(err);
        if (code !== "ENOENT") {
          console.warn(`⚠️ Could not clear contents of ${REPO_RAW_WEEKLY_STATS_DIR}: ${message}`);
        } else {
          debug(`ℹ️ Directory not found, skipping clearing: ${REPO_RAW_WEEKLY_STATS_DIR}`);
        }
      }
      console.log("✅ Existing GitHub activity data deletion attempt complete.");
    } catch (error) {
      console.error("❌ Error during deletion of GitHub activity data:", error);
      // Continue, as the main goal is to populate.
    }
  }

  try {
    await createDirectories(); // Still useful to ensure top-level structure

    const bookmarks = await populateBookmarksData();
    await populateGithubActivityData();

    // No need to call calculateAndStoreAggregatedWeeklyActivity again as it's already called in populateGithubActivityData()

    await populateLogosData(bookmarks); // Pass bookmarks for domain extraction
    await populateOpenGraphImages(bookmarks); // Process OpenGraph images for bookmarks

    console.log("-".repeat(50));
    console.log("✅ ALL DATA VOLUMES POPULATED/UPDATED via data-access layer");
    console.log(`📆 End time: ${new Date().toISOString()}`);
    console.log("-".repeat(50));

    // Update the last successful run timestamp file only on successful completion
    // if it's a local development environment and not explicitly a CI run.
    if (process.env.NODE_ENV === "development" && process.env.CI !== "true") {
      try {
        await fs.writeFile(LAST_RUN_SUCCESS_TIMESTAMP_FILE, new Date().toISOString());
        console.log("✅ Successfully updated last run timestamp for populate-volumes (Development run).");
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn("⚠️ Could not update last run timestamp file:", message);
      }
    } else {
      // In production, CI, or other non-development environments, we don't update the timestamp
      // The script should run fully each time during builds in these environments
      console.log("ℹ️ Skipping update of last run timestamp for populate-volumes (Production/CI/Non-Dev run).");
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ VOLUME POPULATION FAILED:", error);
    process.exit(1);
  }
}

// Run the main function
void populateAllVolumes();
