/**
 * @file Sitemap submission to Google Search Console & IndexNow (Bing)
 * @description Submits sitemap.xml and URLs to search engines with rate limiting
 *
 * CLI: `bun scripts/submit-sitemap.ts [--google-only|--indexnow-only|--debug]`
 * Override safety: `FORCE_SITEMAP_SUBMIT=true`
 *
 * Required env vars:
 * - Google: GOOGLE_SEARCH_INDEXING_SA_EMAIL, GOOGLE_SEARCH_INDEXING_SA_PRIVATE_KEY
 * - IndexNow: INDEXNOW_KEY (must match the contents of `public/bc4df0455a374597950eb9199509f599.txt`)
 *             A verification key file **MUST** be accessible at the site root (e.g. https://williamcallahan.com/bc4df0455a374597950eb9199509f599.txt)
 *             See <https://www.bing.com/indexnow/getstarted> for setup details.
 * - Optional: NEXT_PUBLIC_SITE_URL, GOOGLE_SEARCH_CONSOLE_PROPERTY
 *
 * Refs: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
 *       https://www.indexnow.org/documentation
 *       https://www.bing.com/indexnow/getstarted
 */

import { loadEnvironmentWithMultilineSupport } from "@/lib/utils/env-loader";
loadEnvironmentWithMultilineSupport();

import { JWT } from "google-auth-library";
import sitemap from "../src/app/sitemap";
import {
  loadRateLimitStoreFromS3,
  incrementAndPersist,
  persistRateLimitStoreToS3,
} from "@/lib/rate-limiter";
import { INDEXING_RATE_LIMIT_PATH } from "@/lib/constants";
import {
  GoogleCredentialError,
  createAuthClient,
  notifyGoogle,
  submitGoogleSitemap,
} from "./lib/google-indexing";
import { submitToIndexNow } from "./lib/indexnow-submit";

// Configuration constants
const CANONICAL_SITE_URL = "https://williamcallahan.com";
const DAILY_GOOGLE_LIMIT_CONFIG = { maxRequests: 50, windowMs: 24 * 60 * 60 * 1000 } as const;
const GOOGLE_STORE = "googleIndexing";
const GOOGLE_CONTEXT = "daily";
const URL_INDEXING_ENABLED = false; // Google deprecated generic per-URL Indexing API submissions
const LOG_PREFIX = {
  google: "[Google]",
  indexNow: "[IndexNow]",
  sitemap: "[Sitemap Submit]",
} as const;

// CLI flags
const DEBUG_MODE = process.argv.includes("--debug");
const GOOGLE_ONLY = process.argv.includes("--google-only");
const INDEXNOW_ONLY = process.argv.includes("--indexnow-only");
const SKIP_GOOGLE = process.argv.includes("--skip-google") || INDEXNOW_ONLY;
const SKIP_INDEXNOW = process.argv.includes("--skip-indexnow") || GOOGLE_ONLY;

// Environment configuration
const FORCE_SUBMIT = process.env.FORCE_SITEMAP_SUBMIT === "true";
const BASE_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? CANONICAL_SITE_URL;
const isLocalhost = /localhost|127\.|\.local/.test(BASE_SITE_URL);
const submissionSiteUrl = isLocalhost ? CANONICAL_SITE_URL : BASE_SITE_URL;

const INDEXNOW_KEY_ENV = process.env.INDEXNOW_KEY ?? "";
const INDEXNOW_KEY_FILE = INDEXNOW_KEY_ENV ? `${INDEXNOW_KEY_ENV}.txt` : "";

if (GOOGLE_ONLY && INDEXNOW_ONLY) {
  console.warn("Both --google-only and --indexnow-only supplied – defaulting to sending to both.");
}

const main = async (): Promise<void> => {
  // Initialize auth client if Google submission is enabled
  // authClient being non-null is the single source of truth for "Google enabled"
  let authClient: JWT | null = null;

  if (!SKIP_GOOGLE) {
    try {
      authClient = createAuthClient();
    } catch (err) {
      if (err instanceof GoogleCredentialError) {
        console.error(`${LOG_PREFIX.google} ${err.formatWithDiagnostics()}`);
        console.warn(`${LOG_PREFIX.google} Google submission disabled due to credential error.`);
      } else {
        throw err; // Re-throw unexpected errors
      }
    }
  }

  // Handle URL indexing if enabled (requires valid auth client)
  if (URL_INDEXING_ENABLED && authClient) {
    await processUrlIndexing(authClient);
  } else if (DEBUG_MODE) {
    console.info(
      `${LOG_PREFIX.google} Per-URL Indexing-API submission disabled – sitemap ping only`,
    );
  }

  // Validate environment before proceeding
  if (submissionSiteUrl !== CANONICAL_SITE_URL && !FORCE_SUBMIT) {
    if (DEBUG_MODE) {
      console.warn(
        `${LOG_PREFIX.sitemap} Skipping – submissions are only allowed for ${CANONICAL_SITE_URL}. Current domain: ${submissionSiteUrl}. Set FORCE_SITEMAP_SUBMIT=true to override.`,
      );
    }
    return;
  }

  const siteUrlCanonical = submissionSiteUrl.endsWith("/")
    ? submissionSiteUrl
    : `${submissionSiteUrl}/`;
  const sitemapUrl = `${siteUrlCanonical}sitemap.xml`;

  // Submit to Google (only if auth client was successfully initialized)
  if (authClient) {
    const property = process.env.GOOGLE_SEARCH_CONSOLE_PROPERTY;
    if (property) {
      await submitGoogleSitemap(authClient, sitemapUrl, property);
    } else {
      const msg =
        "GOOGLE_SEARCH_CONSOLE_PROPERTY env var is missing. Set it to your " +
        "Search Console property ID (e.g. 'sc-domain:williamcallahan.com' " +
        "or 'https://williamcallahan.com/') before running the sitemap " +
        "submission script.";
      if (GOOGLE_ONLY) {
        throw new Error(msg);
      }
      console.warn(`${LOG_PREFIX.google} ${msg} Skipping Google submission.`);
    }
  } else if (DEBUG_MODE) {
    console.info(`${LOG_PREFIX.google} Skipped – credentials not available or CLI flag set.`);
  }

  // Submit to IndexNow
  if (!SKIP_INDEXNOW)
    await submitToIndexNow(
      siteUrlCanonical,
      INDEXNOW_KEY_ENV,
      INDEXNOW_KEY_FILE,
      isLocalhost,
      DEBUG_MODE,
    );
  else if (DEBUG_MODE) console.info(`${LOG_PREFIX.indexNow} Skipped due to CLI flag.`);
};

async function processUrlIndexing(client: JWT): Promise<void> {
  await loadRateLimitStoreFromS3(GOOGLE_STORE, INDEXING_RATE_LIMIT_PATH);

  const sitemapData = await sitemap();
  const allUrls = sitemapData.map((u) => u.url);
  const totalUrls = allUrls.length;
  console.info(`Found ${totalUrls} URLs to process.`);

  // Filter URLs based on remaining quota
  const allowedUrls: string[] = [];
  for (const url of allUrls) {
    if (
      incrementAndPersist(
        GOOGLE_STORE,
        GOOGLE_CONTEXT,
        DAILY_GOOGLE_LIMIT_CONFIG,
        INDEXING_RATE_LIMIT_PATH,
      )
    ) {
      allowedUrls.push(url);
    } else {
      console.warn(`${LOG_PREFIX.google} Daily limit reached – skipping remaining URLs.`);
      break;
    }
  }

  if (!allowedUrls.length) {
    console.info("No quota available for URL submissions – skipping");
    return;
  }

  const batchSize = 50;
  for (let i = 0; i < allowedUrls.length; i += batchSize) {
    const batch = allowedUrls.slice(i, i + batchSize);
    console.info(`${LOG_PREFIX.google} Submitting batch ${i / batchSize + 1}`);

    for (const url of batch) {
      const result = await notifyGoogle(client, url, "URL_UPDATED");
      if (result) {
        console.info(`${LOG_PREFIX.google} Successfully submitted ${url}`);
        await persistRateLimitStoreToS3(GOOGLE_STORE, INDEXING_RATE_LIMIT_PATH);
      }
    }

    if (i + batchSize < allowedUrls.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  console.info(`${LOG_PREFIX.google} URL-level submission complete`);
}

// Execute main with proper error handling using top-level await
try {
  await main();
  // Explicitly exit to avoid hanging event-loop handles (e.g. open keep-alive
  // sockets inside google-auth-library / gaxios). Only run after successful
  // completion; failures are handled in the catch below.
  process.exit(0);
} catch (err) {
  console.error("An unexpected error occurred in the main process:", err);
  process.exit(1);
}
