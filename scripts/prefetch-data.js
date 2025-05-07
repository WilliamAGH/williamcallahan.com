#!/usr/bin/env node

/**
 * Data prefetch script for Next.js builds
 *
 * This script ensures all necessary data is populated in volumes and cache
 * by leveraging the centralized data-access layer or calling API endpoints
 * which in turn use the data-access layer.
 * IT IS NOT YET USED ANYWHERE -- DO WE PREFETCH CACHE AUTOMATICALLY ALREADY WITHOUT IT?
 */

const http = require('node:http');
const https = require('node:https');
const path = require('node:path');
const { resolve } = path;
const fs = require('node:fs/promises');
// Assuming data-access.js is the compiled output in the same relative location
const { getBookmarks, getGithubActivity, getLogo, getInvestmentDomainsAndIds } = require('../lib/data-access');

// Configure longer timeouts for prefetching
http.globalAgent.maxSockets = 10;
https.globalAgent.maxSockets = 10;
http.globalAgent.keepAlive = true;
https.globalAgent.keepAlive = true;

const VERBOSE = process.env.VERBOSE === 'true';
const ROOT_DIR = process.cwd();


// Wait function for rate limiting
const wait = (ms) => new Promise(resolvePromise => setTimeout(resolvePromise, ms));

// Get hostname and port - works for both local dev and Docker
function getHostAndPort() {
  const isInDocker = process.env.CONTAINER === 'true' || process.env.IN_CONTAINER === 'true';
  const hostApi = isInDocker ? 'http://localhost:3000' : 'http://localhost:3000';
  console.log(`[Prefetch] Running in ${isInDocker ? 'Docker' : 'local'} environment, using API host: ${hostApi}`);
  return hostApi;
}

/**
 * Fetch API data with better error handling and retry logic
 * This will call the API endpoints which now use the data-access layer.
 */
async function fetchApiEndpoint(apiUrl, endpointName, retries = 3, retryDelay = 1000) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[Prefetch] Fetching ${endpointName} (attempt ${attempt}/${retries}): ${apiUrl}`);
      const response = await fetch(apiUrl, {
        headers: { 'X-Prefetch-Build': 'true' }, // Keep header for logging/tracking if needed
        signal: AbortSignal.timeout(60000) // 60 second timeout for prefetch
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => `HTTP error ${response.status}`);
        throw new Error(`HTTP error ${response.status}: ${response.statusText}. Response: ${errorText.substring(0, 200)}`);
      }
      const data = await response.json();
      console.log(`[Prefetch] Successfully fetched data from ${endpointName}`);
      const isComplete = response.headers.get('X-Data-Complete') === 'true';
      if (!isComplete) {
        console.warn(`[Prefetch] ⚠️ Data from ${endpointName} (${apiUrl}) is marked as incomplete by API.`);
      }
      return data;
    } catch (error) {
      console.error(`[Prefetch] Error fetching ${endpointName} (${apiUrl}) (attempt ${attempt}/${retries}):`, error.message);
      lastError = error;
      if (attempt < retries) {
        const currentDelay = retryDelay * attempt;
        console.log(`[Prefetch] Waiting ${currentDelay}ms before retrying ${endpointName}...`);
        await wait(currentDelay);
      }
    }
  }
  console.error(`[Prefetch] Failed to fetch ${endpointName} from ${apiUrl} after ${retries} attempts.`);
  throw lastError; // Re-throw the last error
}


/**
 * Prefetch all bookmarks data by calling the API endpoint.
 */
async function prefetchBookmarksData(apiBase) {
  try {
    console.log('[Prefetch] Prefetching bookmarks data via API endpoint...');
    // The API endpoint now uses getBookmarks from data-access
    const bookmarks = await fetchApiEndpoint(`${apiBase}/api/bookmarks`, 'Bookmarks API');
    console.log(`[Prefetch] Successfully triggered bookmark data population. Count: ${bookmarks?.length || 0}`);
    return bookmarks; // Return for domain extraction
  } catch (error) {
    console.error('[Prefetch] Failed to prefetch bookmarks via API:', error.message);
    return []; // Return empty array on failure to allow logo prefetch to proceed if possible
  }
}

/**
 * Prefetch GitHub activity data by calling the API endpoint.
 */
async function prefetchGitHubActivityData(apiBase) {
  try {
    console.log('[Prefetch] Prefetching GitHub activity data via API endpoint...');
    // The API endpoint now uses getGithubActivity from data-access
    const activity = await fetchApiEndpoint(`${apiBase}/api/github-activity`, 'GitHub Activity API');
    console.log(`[Prefetch] Successfully triggered GitHub activity data population. Complete: ${activity?.dataComplete}`);
  } catch (error) {
    console.error('[Prefetch] Failed to prefetch GitHub activity via API:', error.message);
    // Continue even if this fails
  }
}

/**
 * Prefetch logos for all domains using the getLogo data-access function.
 */
async function prefetchLogosData(apiBase, bookmarksData) {
  const domains = new Set();

  // 1. Extract domains from prefetched bookmarks
  if (bookmarksData && bookmarksData.length > 0) {
    for (const bookmark of bookmarksData) {
      try {
        if (bookmark.url) domains.add(new URL(bookmark.url).hostname.replace(/^www\./, ''));
      } catch (e) { /* ignore */ }
    }
  }
  console.log(`[Prefetch] Extracted ${domains.size} domains from bookmarks.`);

  // 2. Extract domains from investments data (using data-access)
  try {
    const investmentDomainsMap = await getInvestmentDomainsAndIds();
    investmentDomainsMap.forEach((_id, domain) => domains.add(domain));
    console.log(`[Prefetch] Added ${investmentDomainsMap.size} domains from investments. Total unique: ${domains.size}`);
  } catch(e) {
    console.warn('[Prefetch] Could not get investment domains for logos:', e.message);
  }

  // 3. Extract domains from experience.ts (simplified, consider moving to data-access)
  try {
    const experienceContent = await fs.readFile(path.join(ROOT_DIR, 'data', 'experience.ts'), 'utf-8');
    const experienceBlocks = experienceContent.split(/^\s*{\s*(?:"|')id(?:"|'):/m);
    for (let i = 1; i < experienceBlocks.length; i++) {
        const block = experienceBlocks[i];
        const urlPatterns = [/companyUrl:\s*['"](?:https?:\/\/)?(?:www\.)?([^\/'"]+)['"]/g, /url:\s*['"](?:https?:\/\/)?(?:www\.)?([^\/'"]+)['"]/g, /website:\s*['"](?:https?:\/\/)?(?:www\.)?([^\/'"]+)['"]/g];
        for (const pattern of urlPatterns) {
            let urlMatch;
            while ((urlMatch = pattern.exec(block)) !== null) { if (urlMatch[1]) domains.add(urlMatch[1]); }
        }
    }
    console.log(`[Prefetch] Extracted domains from experience.ts. Total unique: ${domains.size}`);
  } catch (e) { console.warn('[Prefetch] Could not read/parse experience.ts for domains.'); }

  // 4. Extract domains from education.ts (simplified)
   try {
    const educationContent = await fs.readFile(path.join(ROOT_DIR, 'data', 'education.ts'), 'utf-8');
    const educationBlocks = educationContent.split(/^\s*{\s*(?:"|')id(?:"|'):/m);
    for (let i = 1; i < educationBlocks.length; i++) {
        const block = educationBlocks[i];
        const urlPatterns = [/institutionUrl:\s*['"](?:https?:\/\/)?(?:www\.)?([^\/'"]+)['"]/g, /url:\s*['"](?:https?:\/\/)?(?:www\.)?([^\/'"]+)['"]/g, /website:\s*['"](?:https?:\/\/)?(?:www\.)?([^\/'"]+)['"]/g];
        for (const pattern of urlPatterns) {
            let urlMatch;
            while ((urlMatch = pattern.exec(block)) !== null) { if (urlMatch[1]) domains.add(urlMatch[1]); }
        }
    }
    console.log(`[Prefetch] Extracted domains from education.ts. Total unique: ${domains.size}`);
  } catch (e) { console.warn('[Prefetch] Could not read/parse education.ts for domains.'); }

  // 5. Add hardcoded domains
  const KNOWN_DOMAINS = ['creighton.edu', 'unomaha.edu', 'stanford.edu', 'columbia.edu', 'gsb.columbia.edu', 'cfp.net', 'seekinvest.com', 'tsbank.com', 'mutualfirst.com', 'morningstar.com'];
  KNOWN_DOMAINS.forEach(domain => domains.add(domain));
  console.log(`[Prefetch] Added ${KNOWN_DOMAINS.length} hardcoded domains. Total unique domains for logos: ${domains.size}`);

  const domainArray = Array.from(domains);
  let successCount = 0;
  let failureCount = 0;
  const BATCH_SIZE = 5; // Process logos in smaller batches

  for (let i = 0; i < domainArray.length; i += BATCH_SIZE) {
    const batch = domainArray.slice(i, i + BATCH_SIZE);
    console.log(`[Prefetch] Processing logo batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(domainArray.length / BATCH_SIZE)} for ${batch.length} domains`);
    const promises = batch.map(async (domain) => {
      try {
        // Call getLogo directly. It handles fetching and storing to volume/cache.
        // The apiBase is used by getLogo if it needs to make internal validation calls.
        const logoResult = await getLogo(domain, apiBase);
        if (logoResult && logoResult.buffer) {
          if (VERBOSE) console.log(`[Prefetch] Logo for ${domain} ensured by data-access layer.`);
          successCount++;
        } else {
          if (VERBOSE) console.warn(`[Prefetch] Failed to ensure logo for ${domain} via data-access layer.`);
          failureCount++;
        }
      } catch (error) {
        console.warn(`[Prefetch] Error ensuring logo for ${domain}:`, error.message);
        failureCount++;
      }
    });
    await Promise.allSettled(promises);
    if (i + BATCH_SIZE < domainArray.length) {
      await wait(200); // Shorter delay as getLogo has its own internal fetching logic
    }
  }
  console.log(`[Prefetch] Logo prefetching complete: ${successCount} ensured, ${failureCount} failed/skipped.`);
}

/**
 * Ensure critical data directories exist
 */
async function ensureDataDirectories() {
  const dirs = [
    'data/bookmarks',
    'data/github-activity',
    'data/images/logos'
  ];
  for (const dir of dirs) {
    try {
      await fs.mkdir(resolve(process.cwd(), dir), { recursive: true });
      console.log(`[Prefetch] Ensured directory exists: ${dir}`);
    } catch (error) {
      console.error(`[Prefetch] Failed to create directory ${dir}:`, error.message);
      // If critical directories can't be made, we might want to exit.
    }
  }
}

/**
 * Main execution function
 */
async function main() {
  console.log('[Prefetch] Starting data prefetch for build...');
  const startTime = Date.now();

  try {
    await ensureDataDirectories();
    const apiBase = getHostAndPort();

    // Prefetch bookmarks and GitHub activity by calling their respective API endpoints.
    // These endpoints now use the data-access layer.
    const bookmarks = await prefetchBookmarksData(apiBase);
    await prefetchGitHubActivityData(apiBase);

    // For logos, we gather all domains and then call getLogo from data-access for each.
    // This ensures logos are fetched and stored in volumes if not already present.
    if (bookmarks) { // bookmarks can be null if API call failed
        await prefetchLogosData(apiBase, bookmarks);
    } else {
        console.warn('[Prefetch] No bookmarks data available to extract domains for logo prefetching.');
        // Attempt to prefetch logos using only investment and other hardcoded domains
        await prefetchLogosData(apiBase, []);
    }


    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[Prefetch] ✅ All data prefetch routines completed in ${duration}s`);
    process.exit(0);
  } catch (error) {
    console.error('[Prefetch] ❌ Prefetch script failed:', error.message);
    process.exit(1);
  }
}

// Execute the main function
main();
