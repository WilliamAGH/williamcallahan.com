#!/usr/bin/env node

/**
 * Data prefetch script for Next.js builds
 *
 * This script ensures all necessary data is populated in volumes and cache
 * by leveraging the centralized data-access layer directly during build time.
 * This avoids API calls to localhost during Docker builds where no server is running.
 */

import path from 'node:path';
import fs from 'node:fs/promises';
// Import data-access functions directly
import { getLogo, getInvestmentDomainsAndIds, getBookmarks, getGithubActivity } from '../lib/data-access';
import type { UnifiedBookmark } from '../types'; // Import UnifiedBookmark

// Configure longer timeouts for prefetching
const VERBOSE = process.env.VERBOSE === 'true';
const ROOT_DIR = process.cwd();
const BUILD_TIME = process.env.NODE_ENV === 'production' || process.env.NEXT_PHASE === 'phase-production-build';

// Wait function for rate limiting
const wait = (ms: number): Promise<void> => new Promise<void>(resolvePromise => setTimeout(resolvePromise, ms));

/**
 * Prefetch all bookmarks data using the data-access layer directly.
 * This bypasses API calls and uses the same logic as the API endpoints.
 */
async function prefetchBookmarksData(): Promise<UnifiedBookmark[]> {
  try {
    console.log('[Prefetch] Prefetching bookmarks data via data-access layer...');

    // Use getBookmarks directly from data-access layer
    // During build time, we skip external fetch to avoid API calls
    const bookmarks = await getBookmarks(BUILD_TIME);

    if (bookmarks && Array.isArray(bookmarks) && bookmarks.length > 0) {
      console.log(`[Prefetch] Successfully fetched ${bookmarks.length} bookmarks from data-access layer.`);
      return bookmarks;
    }

    console.warn('[Prefetch] No bookmarks returned from data-access layer, using empty array.');
    return [];
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Prefetch] Failed to prefetch bookmarks via data-access layer:', errorMessage);
    return [];
  }
}

/**
 * Prefetch GitHub activity data using the data-access layer directly.
 * This bypasses API calls and uses the same logic as the API endpoints.
 */
async function prefetchGitHubActivityData(): Promise<void> {
  try {
    console.log('[Prefetch] Prefetching GitHub activity data via data-access layer...');

    // Use getGithubActivity directly from data-access layer
    const activity = await getGithubActivity();

    if (activity) {
      console.log(`[Prefetch] Successfully fetched GitHub activity data. Complete: ${activity.trailingYearData?.dataComplete}`);
    } else {
      console.log('[Prefetch] GitHub activity data-access returned no data, will use static fallbacks.');
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Prefetch] Failed to prefetch GitHub activity via data-access layer:', errorMessage);
    // Continue even if this fails
  }
}

/**
 * Prefetch logos for all domains using the getLogo data-access function.
 */
async function prefetchLogosData(bookmarksData: UnifiedBookmark[]): Promise<void> {
  const domains = new Set<string>();

  // 1. Extract domains from prefetched bookmarks
  if (bookmarksData && bookmarksData.length > 0) {
    for (const bookmark of bookmarksData) {
      try {
        if (bookmark.url) domains.add(new URL(bookmark.url).hostname.replace(/^www\./, ''));
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_e: unknown) { /* ignore */ }
    }
  }
  console.log(`[Prefetch] Extracted ${domains.size} domains from bookmarks.`);

  // 2. Extract domains from investments data (using data-access)
  try {
    const investmentDomainsMap = await getInvestmentDomainsAndIds();
    for (const [, domain] of investmentDomainsMap) {
      domains.add(domain);
    }
    console.log(`[Prefetch] Added ${investmentDomainsMap.size} domains from investments. Total unique: ${domains.size}`);
  } catch(e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.warn('[Prefetch] Could not get investment domains for logos:', errorMessage);
  }

  // 3. Extract domains from experience.ts (simplified, consider moving to data-access)
  try {
    const experienceContent = await fs.readFile(path.join(ROOT_DIR, 'data', 'experience.ts'), 'utf-8');
    const experienceBlocks = experienceContent.split(/^\s*{\s*(?:"|')id(?:"|'):/m);
    for (let i = 1; i < experienceBlocks.length; i++) {
        const block = experienceBlocks[i];
        const urlPatterns = [/companyUrl:\s*['"](?:https?:\/\/)?(?:www\.)?([^/'"]+)['"]/g, /url:\s*['"](?:https?:\/\/)?(?:www\.)?([^/'"]+)['"]/g, /website:\s*['"](?:https?:\/\/)?(?:www\.)?([^/'"]+)['"]/g];
        for (const pattern of urlPatterns) {
            let urlMatch: RegExpExecArray | null = pattern.exec(block);
            while (urlMatch !== null) {
                const capturedDomain = urlMatch[1]; // capturedDomain is string | undefined
                if (capturedDomain) { // Checks for undefined, null, and empty string
                    domains.add(capturedDomain); // capturedDomain is narrowed to string here
                }
                urlMatch = pattern.exec(block);
            }
        }
    }
    console.log(`[Prefetch] Extracted domains from experience.ts. Total unique: ${domains.size}`);
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.warn('[Prefetch] Could not read/parse experience.ts for domains:', errorMessage);
  }

  // 4. Extract domains from education.ts (simplified)
   try {
    const educationContent = await fs.readFile(path.join(ROOT_DIR, 'data', 'education.ts'), 'utf-8');
    const educationBlocks = educationContent.split(/^\s*{\s*(?:"|')id(?:"|'):/m);
    for (let i = 1; i < educationBlocks.length; i++) {
        const block = educationBlocks[i];
        const urlPatterns = [/institutionUrl:\s*['"](?:https?:\/\/)?(?:www\.)?([^/'"]+)['"]/g, /url:\s*['"](?:https?:\/\/)?(?:www\.)?([^/'"]+)['"]/g, /website:\s*['"](?:https?:\/\/)?(?:www\.)?([^/'"]+)['"]/g];
        for (const pattern of urlPatterns) {
            let urlMatch: RegExpExecArray | null = pattern.exec(block);
            while (urlMatch !== null) {
                const capturedDomain = urlMatch[1]; // capturedDomain is string | undefined
                if (capturedDomain) { // Checks for undefined, null, and empty string
                    domains.add(capturedDomain); // capturedDomain is narrowed to string here
                }
                urlMatch = pattern.exec(block);
            }
        }
    }
    console.log(`[Prefetch] Extracted domains from education.ts. Total unique: ${domains.size}`);
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.warn('[Prefetch] Could not read/parse education.ts for domains:', errorMessage);
  }

  // 5. Add hardcoded domains
  const KNOWN_DOMAINS = ['creighton.edu', 'unomaha.edu', 'stanford.edu', 'columbia.edu', 'gsb.columbia.edu', 'cfp.net', 'seekinvest.com', 'tsbank.com', 'mutualfirst.com', 'morningstar.com'];
  for (const domain of KNOWN_DOMAINS) {
    domains.add(domain);
  }
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
        const logoResult = await getLogo(domain);
        if (logoResult?.buffer) {
          if (VERBOSE) console.log(`[Prefetch] Logo for ${domain} ensured by data-access layer.`);
          successCount++;
        } else {
          if (VERBOSE) console.warn(`[Prefetch] Failed to ensure logo for ${domain} via data-access layer.`);
          failureCount++;
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`[Prefetch] Error ensuring logo for ${domain}:`, errorMessage);
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
async function ensureDataDirectories(): Promise<void> {
  const dirs: string[] = [
    'data/bookmarks',
    'data/github-activity',
    'data/images/logos'
  ];
  for (const dir of dirs) {
    try {
      await fs.mkdir(path.resolve(process.cwd(), dir), { recursive: true });
      console.log(`[Prefetch] Ensured directory exists: ${dir}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Prefetch] Failed to create directory ${dir}:`, errorMessage);
      // If critical directories can't be made, we might want to exit.
    }
  }
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  console.log('[Prefetch] Starting data prefetch for build using data-access layer...');
  const startTime = Date.now();

  try {
    await ensureDataDirectories();

    // Prefetch bookmarks and GitHub activity using data-access layer directly
    // This avoids API calls during build time and uses the same logic as the API endpoints
    const bookmarks = await prefetchBookmarksData();

    // Write bookmarks to data/bookmarks/bookmarks.json for static build compatibility
    if (bookmarks && Array.isArray(bookmarks)) {
      const bookmarksPath = path.join(process.cwd(), 'data', 'bookmarks', 'bookmarks.json');
      try {
        await fs.writeFile(bookmarksPath, JSON.stringify(bookmarks, null, 2), 'utf-8');
        console.log(`[Prefetch] Wrote ${bookmarks.length} bookmarks to ${bookmarksPath}`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Prefetch] Failed to write bookmarks to ${bookmarksPath}:`, errorMessage);
        // Continue execution as this is for static build compatibility, but log the error
      }
    }

    await prefetchGitHubActivityData();

    // For logos, we gather all domains and then call getLogo from data-access for each.
    // This ensures logos are fetched and stored in volumes if not already present.
    await prefetchLogosData(bookmarks);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[Prefetch] ✅ All data prefetch routines completed in ${duration}s`);
    process.exit(0);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Prefetch] ❌ Prefetch script failed:', errorMessage);
    process.exit(1);
  }
}

// Execute the main function
void main();
