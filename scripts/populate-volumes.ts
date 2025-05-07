#!/usr/bin/env ts-node

/**
 * DIRECT VOLUME POPULATION SCRIPT
 *
 * This script uses the centralized data-access layer to populate data volumes.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { getBookmarks, getGithubActivity, getLogo, getInvestmentDomainsAndIds, calculateAndStoreAggregatedWeeklyActivity } from '../lib/data-access';

// CONFIG
const VERBOSE = process.env.VERBOSE === 'true' || true;
const LAST_RUN_SUCCESS_TIMESTAMP_FILE = path.join(process.cwd(), '.populate-volumes-last-run-success');
const RUN_INTERVAL_HOURS = 12;

// Argument parsing
const args = process.argv.slice(2); // Exclude 'node' and script path
const forceRefreshGithub = args.includes('--force-refresh-github');

// DATA VOLUME PATHS (Primarily for createDirectories, actual paths are in data-access)
const ROOT_DIR = process.cwd();
const DATA_DIR = path.join(ROOT_DIR, 'data');
const BOOKMARKS_DIR = path.join(DATA_DIR, 'bookmarks');
const GITHUB_DATA_DIR = path.join(DATA_DIR, 'github-activity');
const IMAGES_DIR = path.join(DATA_DIR, 'images');
const LOGOS_DIR = path.join(IMAGES_DIR, 'logos');
const LOGOS_BY_ID_DIR = path.join(LOGOS_DIR, 'byId');
const REPO_RAW_WEEKLY_STATS_DIR = path.join(GITHUB_DATA_DIR, 'repo_raw_weekly_stats');
const BOOKMARK_IMAGES_DIR = path.join(IMAGES_DIR, 'bookmarks');


// Create all required directories (data-access layer also ensures directories)
async function createDirectories() {
  console.log('🔧 Ensuring all necessary data directories exist...');
  await fs.mkdir(BOOKMARKS_DIR, { recursive: true });
  await fs.mkdir(GITHUB_DATA_DIR, { recursive: true });
  await fs.mkdir(REPO_RAW_WEEKLY_STATS_DIR, { recursive: true });
  await fs.mkdir(IMAGES_DIR, { recursive: true });
  await fs.mkdir(LOGOS_DIR, { recursive: true });
  await fs.mkdir(LOGOS_BY_ID_DIR, { recursive: true });
  await fs.mkdir(BOOKMARK_IMAGES_DIR, { recursive: true });
  console.log(`✅ All necessary data directories ensured by populate-volumes.ts.`);
}

async function populateBookmarksData() {
  console.log('📚 Populating bookmarks volume using data-access layer...');
  const bookmarks = await getBookmarks(); // This now handles fetch, volume write, cache
  if (bookmarks) {
    console.log(`✅ Bookmarks volume populated/updated. Total: ${bookmarks.length}`);
    return bookmarks;
  } else {
    console.error('❌ Failed to populate bookmarks volume via data-access layer.');
    return [];
  }
}

async function populateGithubActivityData() {
  console.log('🐙 Populating GitHub activity volume using data-access layer...');
  const activity = await getGithubActivity(); // This now handles fetch, volume write, cache
  if (activity) {
    console.log(`✅ GitHub activity volume populated/updated. Data complete: ${activity.dataComplete}`);
    await calculateAndStoreAggregatedWeeklyActivity();
    return activity;
  } else {
    console.error('❌ Failed to populate GitHub activity volume via data-access layer.');
    return null;
  }
}

async function populateLogosData(bookmarks: any[]) {
  console.log('🖼️ Populating logos volume using data-access layer...');
  const domains = new Set<string>();
  const domainToIdMap = new Map<string, string>(); // Still useful for ID mapping if getLogo needs it

  // 1. Extract domains from bookmarks
  if (bookmarks && bookmarks.length > 0) {
    console.log(`📊 Extracting domains from ${bookmarks.length} bookmarks...`);
    for (const bookmark of bookmarks) {
      try {
        if (bookmark.url) {
          const url = new URL(bookmark.url);
          const domain = url.hostname.replace(/^www\./, '');
          domains.add(domain);
          if (bookmark.id) domainToIdMap.set(domain, bookmark.id);
        }
      } catch (e) {
        if (VERBOSE) console.log(`⚠️ Could not parse URL for logo: ${bookmark.url || 'undefined'}`);
      }
    }
  }

  // 2. Extract domains from investments data (using data-access)
  console.log('🔍 Fetching investment domains via data-access layer...');
  const investmentDomainsMap = await getInvestmentDomainsAndIds();
  investmentDomainsMap.forEach((id, domain) => {
    domains.add(domain);
    if (!domainToIdMap.has(domain)) domainToIdMap.set(domain, id);
  });
  console.log(`✅ Added ${investmentDomainsMap.size} unique domains from investments.`);

  // 3. Extract domains from experience data (simplified, as data-access doesn't have this yet)
  // TODO: Move experience/education domain extraction to data-access or a shared util if needed frequently
  try {
    const experienceContent = await fs.readFile(path.join(ROOT_DIR, 'data', 'experience.ts'), 'utf-8');
    let currentId: string | null = null;
    const experienceBlocks = experienceContent.split(/^\s*{\s*(?:"|')id(?:"|'):/m);
    for (let i = 1; i < experienceBlocks.length; i++) {
        const block = experienceBlocks[i];
        const idMatch = block.match(/^(?:"|')([^"']+)(?:"|')/);
        if (idMatch) {
            currentId = idMatch[1];
            const urlPatterns = [/companyUrl:\s*['"](?:https?:\/\/)?(?:www\.)?([^\/'"]+)['"]/g, /url:\s*['"](?:https?:\/\/)?(?:www\.)?([^\/'"]+)['"]/g, /website:\s*['"](?:https?:\/\/)?(?:www\.)?([^\/'"]+)['"]/g];
            for (const pattern of urlPatterns) {
                let urlMatch;
                while ((urlMatch = pattern.exec(block)) !== null) {
                    if (urlMatch[1]) { domains.add(urlMatch[1]); if (!domainToIdMap.has(urlMatch[1])) domainToIdMap.set(urlMatch[1], currentId); }
                }
            }
        }
    }
    console.log(`📊 Extracted additional domains from experience.ts. Total unique: ${domains.size}`);
  } catch (e) { console.warn('⚠️ Could not read/parse experience.ts for domains.'); }

  // 4. Extract domains from education data (simplified)
   try {
    const educationContent = await fs.readFile(path.join(ROOT_DIR, 'data', 'education.ts'), 'utf-8');
    let currentId: string | null = null;
    const educationBlocks = educationContent.split(/^\s*{\s*(?:"|')id(?:"|'):/m);
    for (let i = 1; i < educationBlocks.length; i++) {
        const block = educationBlocks[i];
        const idMatch = block.match(/^(?:"|')([^"']+)(?:"|')/);
        if (idMatch) {
            currentId = idMatch[1];
            const urlPatterns = [/institutionUrl:\s*['"](?:https?:\/\/)?(?:www\.)?([^\/'"]+)['"]/g, /url:\s*['"](?:https?:\/\/)?(?:www\.)?([^\/'"]+)['"]/g, /website:\s*['"](?:https?:\/\/)?(?:www\.)?([^\/'"]+)['"]/g];
            for (const pattern of urlPatterns) {
                let urlMatch;
                while ((urlMatch = pattern.exec(block)) !== null) {
                    if (urlMatch[1]) { domains.add(urlMatch[1]); if (!domainToIdMap.has(urlMatch[1])) domainToIdMap.set(urlMatch[1], currentId); }
                }
            }
        }
    }
    console.log(`📊 Extracted additional domains from education.ts. Total unique: ${domains.size}`);
  } catch (e) { console.warn('⚠️ Could not read/parse education.ts for domains.'); }


  // 5. Add hardcoded domains
  const KNOWN_DOMAINS = ['creighton.edu', 'unomaha.edu', 'stanford.edu', 'columbia.edu', 'gsb.columbia.edu', 'cfp.net', 'seekinvest.com', 'tsbank.com', 'mutualfirst.com', 'morningstar.com'];
  KNOWN_DOMAINS.forEach(domain => domains.add(domain));
  console.log(`📊 Added ${KNOWN_DOMAINS.length} hardcoded domains. Total unique domains: ${domains.size}`);

  const domainArray = Array.from(domains);
  let successCount = 0;
  let failureCount = 0;
  const BATCH_SIZE = 10; // Process in batches

  for (let i = 0; i < domainArray.length; i += BATCH_SIZE) {
    const batch = domainArray.slice(i, i + BATCH_SIZE);
    console.log(`⏳ Processing logo batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(domainArray.length / BATCH_SIZE)} for ${batch.length} domains`);
    const promises = batch.map(async (domain) => {
      try {
        // getLogo handles fetching, validation (if possible), and writing to volume.
        // The baseUrlForValidation might be problematic here if the validation API isn't running.
        // The getLogo function in data-access.ts should be robust to this.
        const logoResult = await getLogo(domain, 'http://localhost:3000'); // Placeholder baseUrl
        if (logoResult && logoResult.buffer) {
          console.log(`✅ Logo processed for ${domain} via data-access (source: ${logoResult.source})`);
          successCount++;
        } else {
          console.log(`⚠️ Could not fetch/process logo for ${domain} via data-access.`);
          failureCount++;
        }
      } catch (e) {
        console.error(`❌ Error processing logo for ${domain} via data-access:`, (e as Error).message);
        failureCount++;
      }
    });
    await Promise.allSettled(promises);
    if (i + BATCH_SIZE < domainArray.length) {
      console.log('⏱️ Waiting 500ms before next logo batch...');
      await new Promise(r => setTimeout(r, 500));
    }
  }
  console.log(`📊 Logo population summary: ${successCount} succeeded, ${failureCount} failed.`);
}

// MAIN EXECUTION FUNCTION
async function populateAllVolumes() {
  console.log(`[Debug] Script execution started. Current working directory: ${process.cwd()}`);
  console.log(`[Debug] NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`[Debug] CI: ${process.env.CI}`);
  console.log(`[Debug] LAST_RUN_SUCCESS_TIMESTAMP_FILE path: ${LAST_RUN_SUCCESS_TIMESTAMP_FILE}`);
  if (forceRefreshGithub) {
    console.log('ℹ️ --force-refresh-github flag provided. Preparing to delete existing GitHub data and skip timestamp check.');
  }

  // Timestamp check for local development to avoid running too frequently
  if (!forceRefreshGithub && process.env.NODE_ENV !== 'production' && process.env.CI !== 'true') { // Only apply this logic in non-production, non-CI environments
    console.log('[Debug] Condition for timestamp check met (NODE_ENV is not "production" and CI is not "true"). Attempting timestamp check.');
    try {
      const stats = await fs.stat(LAST_RUN_SUCCESS_TIMESTAMP_FILE).catch((err) => {
        console.log(`[Debug] fs.stat error: ${err.message}. File might not exist or is inaccessible.`);
        return null;
      });
      if (stats) {
        console.log(`[Debug] fs.stat successful. File mtimeMs: ${stats.mtimeMs} (corresponds to ${new Date(stats.mtimeMs).toISOString()})`);
        const lastRunTime = stats.mtimeMs;
        const currentTime = Date.now();
        console.log(`[Debug] Current time (Date.now()): ${currentTime} (corresponds to ${new Date(currentTime).toISOString()})`);
        const hoursSinceLastRun = (currentTime - lastRunTime) / (1000 * 60 * 60);
        console.log(`[Debug] Calculated hoursSinceLastRun: ${hoursSinceLastRun}`);
        console.log(`[Debug] RUN_INTERVAL_HOURS: ${RUN_INTERVAL_HOURS}`);
        if (hoursSinceLastRun < RUN_INTERVAL_HOURS) {
          console.log(`✅ Populate-volumes script ran successfully within the last ${RUN_INTERVAL_HOURS} hours. Skipping full run.`);
          process.exit(0);
        } else {
          console.log('[Debug] Timestamp check: hoursSinceLastRun is not less than RUN_INTERVAL_HOURS. Proceeding with full run.');
        }
      } else {
        console.log('[Debug] fs.stat returned null (or caught error). File stats not available. Proceeding with full run.');
      }
    } catch (e: any) {
      // Ignore errors reading the timestamp file (e.g., if it doesn't exist on first run)
      console.log(`[Debug] Error during timestamp check logic: ${(e as Error).message}. Proceeding with volume population.`);
      console.log('ℹ️ No recent successful run timestamp found, proceeding with volume population.');
    }
  } else {
    console.log('[Debug] Condition for timestamp check NOT met. Skipping timestamp check and proceeding with full run.');
  }

  console.log('🚀 STARTING DIRECT VOLUME POPULATION (using data-access layer)');
  console.log('-'.repeat(50));
  const startTime = new Date().toISOString();
  console.log(`📆 Start time: ${startTime}`);

  if (forceRefreshGithub) {
    console.log('⚠️ --force-refresh-github: Deleting existing GitHub activity data before re-populating...');
    const activityDataFile = path.join(GITHUB_DATA_DIR, 'activity_data.json');
    const aggregatedActivityFile = path.join(GITHUB_DATA_DIR, 'aggregated_weekly_activity.json');
    // Note: REPO_RAW_WEEKLY_STATS_DIR is already defined globally

    try {
      // Delete individual files
      for (const file of [activityDataFile, aggregatedActivityFile]) {
        try {
          await fs.unlink(file);
          console.log(`🗑️ Deleted ${file}`);
        } catch (err: any) {
          if (err.code !== 'ENOENT') { // ENOENT means file not found, which is okay
            console.warn(`⚠️ Could not delete ${file}: ${err.message}`);
          } else {
            if (VERBOSE) console.log(`ℹ️ File not found, skipping deletion: ${file}`);
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
            if (VERBOSE) console.log(`ℹ️ No files found in ${REPO_RAW_WEEKLY_STATS_DIR}, skipping clearing.`);
        }
      } catch (err: any) {
        if (err.code !== 'ENOENT') { // ENOENT means directory not found, also okay
           console.warn(`⚠️ Could not clear contents of ${REPO_RAW_WEEKLY_STATS_DIR}: ${err.message}`);
        } else {
          if (VERBOSE) console.log(`ℹ️ Directory not found, skipping clearing: ${REPO_RAW_WEEKLY_STATS_DIR}`);
        }
      }
      console.log('✅ Existing GitHub activity data deletion attempt complete.');
    } catch (error) {
      console.error('❌ Error during deletion of GitHub activity data:', error);
      // Continue, as the main goal is to populate.
    }
  }

  try {
    await createDirectories(); // Still useful to ensure top-level structure

    const bookmarks = await populateBookmarksData();
    await populateGithubActivityData();

    // Call calculateAndStoreAggregatedWeeklyActivity after raw stats are populated
    console.log('🔄 Aggregating weekly GitHub activity data...');
    await calculateAndStoreAggregatedWeeklyActivity();
    console.log('✅ Weekly GitHub activity aggregation complete.');

    await populateLogosData(bookmarks); // Pass bookmarks for domain extraction

    console.log('-'.repeat(50));
    console.log('✅ ALL DATA VOLUMES POPULATED/UPDATED via data-access layer');
    console.log(`📆 End time: ${new Date().toISOString()}`);
    console.log('-'.repeat(50));

    // Update the last successful run timestamp file only on successful completion
    // if it's not a CI environment. This allows local 'bun run build' to update the timestamp,
    // which subsequent local 'bun run dev' can then use to skip.
    if (process.env.CI !== 'true') {
      try {
        await fs.writeFile(LAST_RUN_SUCCESS_TIMESTAMP_FILE, new Date().toISOString());
        console.log(`✅ Successfully updated last run timestamp for populate-volumes (Local/Non-CI run).`);
      } catch (e) {
        console.warn('⚠️ Could not update last run timestamp file:', e);
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ VOLUME POPULATION FAILED:', error);
    process.exit(1);
  }
}

// Run the main function
populateAllVolumes();