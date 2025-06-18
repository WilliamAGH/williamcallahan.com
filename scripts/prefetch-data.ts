#!/usr/bin/env node

/**
 * Data prefetch script for Next.js builds
 *
 * This script ensures all necessary data is populated in volumes and cache
 * by leveraging the centralized data-access layer directly during build time.
 * This avoids API calls to localhost during Docker builds where no server is running.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { KNOWN_DOMAINS } from "../lib/constants";
// Import data-access functions directly
import {
  getBookmarks,
  getGithubActivity,
  refreshGitHubActivityDataFromApi,
  getInvestmentDomainsAndIds,
  getLogo as getLogoUntyped,
  initializeBookmarksDataAccess,
} from "../lib/data-access";
// Import types
import type { UnifiedBookmark } from "../types"; // Import UnifiedBookmark

// Configure longer timeouts for prefetching
const ROOT_DIR = process.cwd();
const BUILD_TIME =
  process.env.NODE_ENV === "production" || process.env.NEXT_PHASE === "phase-production-build";

// Logo prefetch configuration - make batch size and delay configurable
const LOGO_BATCH_SIZE = Number.parseInt(process.env.LOGO_BATCH_SIZE || "5", 10);
const LOGO_BATCH_DELAY_MS = Number.parseInt(process.env.LOGO_BATCH_DELAY_MS || "200", 10);

// Wait function for rate limiting
const wait = (ms: number): Promise<void> =>
  new Promise<void>((resolvePromise) => setTimeout(resolvePromise, ms));

// Narrow the untyped `getLogo` import to the expected return shape without
// relying on an explicit type assertion at every call site.
const getLogo = getLogoUntyped;

/**
 * Prefetch all bookmarks data using the data-access layer directly.
 * This bypasses API calls and uses the same logic as the API endpoints.
 */
async function prefetchBookmarksData(): Promise<UnifiedBookmark[]> {
  try {
    console.log("[Prefetch] Prefetching bookmarks data via data-access layer...");

    // Use getBookmarks directly from data-access layer
    // In CI/production builds, we skip external fetches to avoid API calls
    // since environment variables for remote APIs are not available during builds
    const bookmarks = await getBookmarks(/* skipExternalFetch = */ BUILD_TIME);

    if (bookmarks && Array.isArray(bookmarks) && bookmarks.length > 0) {
      console.log(
        `[Prefetch] Successfully fetched ${bookmarks.length} bookmarks from data-access layer.`,
      );
      return bookmarks;
    }

    console.warn("[Prefetch] No bookmarks returned from data-access layer, attempting fallback.");
    return [];
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[Prefetch] Failed to prefetch bookmarks via data-access layer:", errorMessage);
    // Attempt to load a fallback 'last known good' JSON file if available
    try {
      const fallbackPath = path.join(process.cwd(), "data", "bookmarks", "bookmarks.json");
      const fallbackData = await fs.readFile(fallbackPath, "utf-8");
      const fallbackBookmarks = JSON.parse(fallbackData) as UnifiedBookmark[];
      if (!Array.isArray(fallbackBookmarks) || fallbackBookmarks.length === 0) {
        console.warn("[Prefetch] Fallback JSON file is empty or contains no bookmarks.");
        return [];
      }
      // Validate fallback data before returning
      const isSuspiciousSingleTest =
        fallbackBookmarks.length === 1 && /test bookmark/i.test(fallbackBookmarks[0]?.title ?? "");
      const isAllMissingUrls =
        fallbackBookmarks.length > 0 && fallbackBookmarks.every((b) => !b.url);
      if (isSuspiciousSingleTest || isAllMissingUrls) {
        console.error(
          "[Prefetch][VALIDATION] Fallback JSON data failed validation checks. Not using invalid data.",
        );
        if (isSuspiciousSingleTest) {
          console.error(
            "[Prefetch][VALIDATION] Reason: Single test bookmark detected in fallback with title:",
            fallbackBookmarks[0]?.title || "N/A",
          );
        }
        if (isAllMissingUrls) {
          console.error(
            "[Prefetch][VALIDATION] Reason: All fallback bookmarks missing URLs. Sample bookmark IDs:",
            fallbackBookmarks
              .slice(0, 3)
              .map((b) => b.id)
              .join(", ") || "N/A",
          );
          // Detailed logging for missing URLs to aid root cause analysis
          const missingUrlCount = fallbackBookmarks.filter((b) => !b.url).length;
          console.error(
            `[Prefetch][VALIDATION][DETAILED] Total bookmarks with missing URLs in fallback: ${missingUrlCount}`,
          );
          if (missingUrlCount <= 5) {
            console.error(
              "[Prefetch][VALIDATION][DETAILED] Bookmarks with missing URLs in fallback (ID, Title):",
              fallbackBookmarks
                .filter((b) => !b.url)
                .map((b) => `ID: ${b.id}, Title: ${b.title || "N/A"}`)
                .join("; "),
            );
          } else {
            console.error(
              "[Prefetch][VALIDATION][DETAILED] First 5 bookmarks with missing URLs in fallback (ID, Title):",
              fallbackBookmarks
                .filter((b) => !b.url)
                .slice(0, 5)
                .map((b) => `ID: ${b.id}, Title: ${b.title || "N/A"}`)
                .join("; "),
            );
          }
        }
        return [];
      }
      console.log(
        `[Prefetch] Successfully loaded ${fallbackBookmarks.length} bookmarks from fallback JSON file: ${fallbackPath}`,
      );
      return fallbackBookmarks;
    } catch (fallbackError: unknown) {
      const fallbackErrorMessage =
        fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      console.error("[Prefetch] Failed to load fallback bookmarks JSON:", fallbackErrorMessage);
      return [];
    }
  }
}

/**
 * Prefetch GitHub activity data using the data-access layer directly.
 * This bypasses API calls and uses the same logic as the API endpoints.
 */
async function prefetchGitHubActivityData(): Promise<void> {
  try {
    console.log("[Prefetch] Prefetching GitHub activity data via data-access layer...");

    // Use getGithubActivity directly from data-access layer
    const activity = await getGithubActivity();

    const now = Date.now();
    let lastRefreshedMs = 0;
    if (activity?.lastRefreshed) {
      lastRefreshedMs = Date.parse(activity.lastRefreshed);
    }

    const MS_24H = 24 * 60 * 60 * 1000;

    if (!activity || !activity.trailingYearData?.data.length) {
      console.log("[Prefetch] GitHub activity missing – triggering initial refresh...");
      await refreshGitHubActivityDataFromApi();
    } else if (now - lastRefreshedMs > MS_24H) {
      console.log(
        `[Prefetch] GitHub activity last updated >24h ago (${activity.lastRefreshed}); refreshing...`,
      );
      // Only attempt refresh if token present to avoid unauth'd rate-limits
      if (process.env.GITHUB_ACCESS_TOKEN_COMMIT_GRAPH || process.env.GITHUB_TOKEN) {
        await refreshGitHubActivityDataFromApi();
      } else {
        console.log("[Prefetch] GitHub token not set during build; skipping auto-refresh.");
      }
    } else {
      console.log(
        `[Prefetch] GitHub activity up-to-date (last refreshed ${activity.lastRefreshed}); no refresh needed.`,
      );
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      "[Prefetch] Failed to prefetch GitHub activity via data-access layer:",
      errorMessage,
    );
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
        if (bookmark.url) domains.add(new URL(bookmark.url).hostname.replace(/^www\./, ""));
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_e: unknown) {
        /* ignore */
      }
    }
  }
  console.log(`[Prefetch] Extracted ${domains.size} domains from bookmarks.`);

  // 2. Extract domains from investments data (using data-access)
  try {
    const investmentDomainsMap = await getInvestmentDomainsAndIds();
    for (const [domain] of investmentDomainsMap) {
      domains.add(domain);
    }
    console.log(
      `[Prefetch] Added ${investmentDomainsMap.size} domains from investments. Total unique: ${domains.size}`,
    );
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.warn("[Prefetch] Could not get investment domains for logos:", errorMessage);
  }

  // 3. Extract domains from experience.ts (simplified, consider moving to data-access)
  try {
    const experienceContent = await fs.readFile(
      path.join(ROOT_DIR, "data", "experience.ts"),
      "utf-8",
    );
    const experienceBlocks = experienceContent.split(/^\s*{\s*(?:"|')id(?:"|'):/m);
    for (let i = 1; i < experienceBlocks.length; i++) {
      const block = experienceBlocks[i];
      const urlPatterns = [
        /companyUrl:\s*['"](?:https?:\/\/)?(?:www\.)?([^/'"]+)['"]/g,
        /url:\s*['"](?:https?:\/\/)?(?:www\.)?([^/'"]+)['"]/g,
        /website:\s*['"](?:https?:\/\/)?(?:www\.)?([^/'"]+)['"]/g,
      ];
      for (const pattern of urlPatterns) {
        let urlMatch: RegExpExecArray | null = pattern.exec(block);
        while (urlMatch !== null) {
          const capturedDomain = urlMatch[1]; // capturedDomain is string | undefined
          if (capturedDomain) {
            // Checks for undefined, null, and empty string
            domains.add(capturedDomain); // capturedDomain is narrowed to string here
          }
          urlMatch = pattern.exec(block);
        }
      }
    }
    console.log(`[Prefetch] Extracted domains from experience.ts. Total unique: ${domains.size}`);
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.warn("[Prefetch] Could not read/parse experience.ts for domains:", errorMessage);
  }

  // 4. Extract domains from education.ts (simplified)
  try {
    const educationContent = await fs.readFile(
      path.join(ROOT_DIR, "data", "education.ts"),
      "utf-8",
    );
    const educationBlocks = educationContent.split(/^\s*{\s*(?:"|')id(?:"|'):/m);
    for (let i = 1; i < educationBlocks.length; i++) {
      const block = educationBlocks[i];
      const urlPatterns = [
        /institutionUrl:\s*['"](?:https?:\/\/)?(?:www\.)?([^/'"]+)['"]/g,
        /url:\s*['"](?:https?:\/\/)?(?:www\.)?([^/'"]+)['"]/g,
        /website:\s*['"](?:https?:\/\/)?(?:www\.)?([^/'"]+)['"]/g,
      ];
      for (const pattern of urlPatterns) {
        let urlMatch: RegExpExecArray | null = pattern.exec(block);
        while (urlMatch !== null) {
          const capturedDomain = urlMatch[1]; // capturedDomain is string | undefined
          if (capturedDomain) {
            // Checks for undefined, null, and empty string
            domains.add(capturedDomain); // capturedDomain is narrowed to string here
          }
          urlMatch = pattern.exec(block);
        }
      }
    }
    console.log(`[Prefetch] Extracted domains from education.ts. Total unique: ${domains.size}`);
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.warn("[Prefetch] Could not read/parse education.ts for domains:", errorMessage);
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

  for (let i = 0; i < domainArray.length; i += LOGO_BATCH_SIZE) {
    const batch = domainArray.slice(i, i + LOGO_BATCH_SIZE);
    console.log(
      `[Prefetch] Processing logo batch ${Math.floor(i / LOGO_BATCH_SIZE) + 1}/${Math.ceil(domainArray.length / LOGO_BATCH_SIZE)} for ${batch.length} domains`,
    );
    const MAX_RETRIES = 3;
    const promises = batch.map(async (domain) => {
      let attempt = 0;
      while (attempt < MAX_RETRIES) {
        try {
          const logoResult = await getLogo(domain);

          if (logoResult && Buffer.isBuffer(logoResult.buffer) && logoResult.buffer.length > 0) {
            const retrievalLabel =
              logoResult.retrieval === "s3-store"
                ? "object storage (S3)"
                : logoResult.retrieval === "mem-cache"
                  ? "internal-cache (memory)"
                  : "external fetch";

            const logoSource: string = logoResult.source ?? "unknown";
            console.log(
              `[Prefetch] Logo for ${domain} ensured (${retrievalLabel}; source=${logoSource}).`,
            );
            successCount++;
            return;
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(
            `[Prefetch] Attempt ${attempt + 1}/${MAX_RETRIES} failed for ${domain}:`,
            message,
          );
        }

        attempt++;
        if (attempt < MAX_RETRIES) {
          const backoff = Math.min(LOGO_BATCH_DELAY_MS * 2 ** attempt, 30000);
          await wait(backoff);
        }
      }
      console.log(
        `[Prefetch] Failed to ensure logo for ${domain} via data-access layer after retries.`,
      );
      failureCount++;
    });
    await Promise.allSettled(promises);
    if (i + LOGO_BATCH_SIZE < domainArray.length) {
      await wait(LOGO_BATCH_DELAY_MS);
    }
  }
  console.log(
    `[Prefetch] Logo prefetching complete: ${successCount} ensured, ${failureCount} failed/skipped.`,
  );
}

/**
 * Ensure critical data directories exist
 */
async function ensureDataDirectories(): Promise<void> {
  const dirs: string[] = ["data/bookmarks", "data/github-activity", "data/images/logos"];
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
  console.log("[Prefetch] Starting data prefetch for build using data-access layer...");
  const startTime = Date.now();

  try {
    await ensureDataDirectories();

    // Initialize the bookmarks data access layer to ensure callbacks are set up
    await initializeBookmarksDataAccess();

    // Prefetch bookmarks and GitHub activity using data-access layer directly
    // This avoids API calls during build time and uses the same logic as the API endpoints
    const bookmarks = await prefetchBookmarksData();

    // Write bookmarks to data/bookmarks/bookmarks.json for static build compatibility
    if (bookmarks && Array.isArray(bookmarks)) {
      const bookmarksPath = path.join(process.cwd(), "data", "bookmarks", "bookmarks.json");
      try {
        await fs.writeFile(bookmarksPath, JSON.stringify(bookmarks, null, 2), "utf-8");
        console.log(`[Prefetch] Wrote ${bookmarks.length} bookmarks to ${bookmarksPath}`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Prefetch] Failed to write bookmarks to ${bookmarksPath}:`, errorMessage);
        // Continue execution as this is for static build compatibility, but log the error
      }
    } else {
      console.warn("[Prefetch] No valid bookmarks data to write to fallback JSON file.");
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
    console.error("[Prefetch] ❌ Prefetch script failed:", errorMessage);
    process.exit(1);
  }
}

// Execute the main function
void main();
