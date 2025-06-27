/**
 * @file Sitemap and URL Submission Script
 * @description Automated script for submitting sitemaps and individual URLs to search engines.
 *
 * Features:
 * - Submits sitemap.xml to Google Search Console and Bing (via IndexNow)
 * - Submits individual recently updated URLs to Google Indexing API
 * - Respects API rate limits with configurable delays
 * - Production-only execution with environment validation
 * - Comprehensive error handling and logging
 *
 * Environment variables required:
 * - NODE_ENV: Must be "production" for submissions to occur
 * - NEXT_PUBLIC_SITE_URL: Site URL (must match production URL)
 * - INDEXNOW_KEY: IndexNow key for Bing sitemap submissions
 * - GOOGLE_PROJECT_ID: Google Cloud Project ID
 * - GOOGLE_SEARCH_INDEXING_SA_EMAIL: Service Account email for Google APIs
 * - GOOGLE_SEARCH_INDEXING_SA_PRIVATE_KEY: Service Account private key for Google APIs
 *
 * Usage:
 *   Per-URL submission is gated by the env var `ENABLE_GOOGLE_URL_INDEXING`.
 *   If that variable is **not** set to "true" the script will skip Indexing-API
 *   calls and only ping the sitemap endpoints.
 * - `bun scripts/submit-sitemap.ts` - Run both sitemap and individual URL submissions
 * - `bun scripts/submit-sitemap.ts --sitemaps-only` - Run only sitemap submissions
 * - `bun scripts/submit-sitemap.ts --individual-only` - Run only individual URL submissions
 * - `bun scripts/submit-sitemap.ts --all` - Explicitly run both (same as no args)
 */

import { loadEnvironmentWithMultilineSupport } from "@/lib/utils/env-loader";
loadEnvironmentWithMultilineSupport();

import { JWT } from "google-auth-library";
import { GaxiosError } from "gaxios";
import type { GoogleIndexingUrlNotificationMetadata } from "@/types/lib";
import type { UrlNotification, IndexingApiResponse } from "@/types/api";
import sitemap from "../app/sitemap.ts";
import { loadRateLimitStoreFromS3, incrementAndPersist, persistRateLimitStoreToS3 } from "@/lib/rate-limiter";
import { INDEXING_RATE_LIMIT_PATH } from "@/lib/constants";

/**
 * Processes the Google Cloud private key from an environment variable.
 * The key is expected to be a single-line string with escaped newlines.
 * This function replaces the escaped newlines with actual newline characters.
 *
 * @param key The private key string from the environment variable.
 * @returns The processed private key with actual newlines.
 */
function processGooglePrivateKey(key?: string): string {
  if (!key) {
    throw new Error("Google Cloud private key is not defined in environment variables.");
  }
  return key.replace(/\\n/g, "\n");
}

// Instantiate the client once outside the function for efficiency
const authClient = new JWT({
  email: process.env.GOOGLE_SEARCH_INDEXING_SA_EMAIL,
  key: processGooglePrivateKey(process.env.GOOGLE_SEARCH_INDEXING_SA_PRIVATE_KEY),
  scopes: ["https://www.googleapis.com/auth/indexing"],
  subject: process.env.GOOGLE_SEARCH_INDEXING_SA_EMAIL,
});

async function notifyGoogle(
  url: string,
  type: "URL_UPDATED" | "URL_DELETED",
): Promise<GoogleIndexingUrlNotificationMetadata | null> {
  const endpoint = "https://indexing.googleapis.com/v3/urlNotifications:publish";
  try {
    const payload: UrlNotification = {
      url,
      type,
    };

    const response = await authClient.request<IndexingApiResponse>({
      url: endpoint,
      method: "POST",
      data: payload,
    });

    if (response.data?.urlNotificationMetadata) {
      return response.data.urlNotificationMetadata as GoogleIndexingUrlNotificationMetadata;
    } else {
      console.error(`[Google] Unexpected response format for ${url}:`, response.data);
      return null;
    }
  } catch (err: unknown) {
    if (err instanceof GaxiosError) {
      console.error(`[Google] Error submitting ${url}: ${err.response?.status} ${err.response?.statusText}`);
      console.error(`[Google] Error details:`, err.response?.data);
    } else {
      console.error(`[Google] Unexpected error for ${url}:`, err);
    }
    return null;
  }
}

const DAILY_GOOGLE_LIMIT_CONFIG = { maxRequests: 50, windowMs: 24 * 60 * 60 * 1000 } as const;
const GOOGLE_STORE = "googleIndexing";
const GOOGLE_CONTEXT = "daily";

// ---------------------------------------------------------------------------
// Feature-flag: enable per-URL Google Indexing-API submission only when the
// environment variable is explicitly set to "true".
// ---------------------------------------------------------------------------
const URL_INDEXING_ENABLED = process.env.ENABLE_GOOGLE_URL_INDEXING === "true";

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------
const DEBUG_MODE = process.argv.includes("--debug");

const main = async (): Promise<void> => {
  if (URL_INDEXING_ENABLED) {
    // ---------------------------------------------------------------------
    // Per-URL submission path (Indexing API) – gated by env flag.
    // ---------------------------------------------------------------------

    // Initialise persistent rate-limit store
    await loadRateLimitStoreFromS3(GOOGLE_STORE, INDEXING_RATE_LIMIT_PATH);

    const allUrls = sitemap().map((u) => u.url);
    const totalUrls = allUrls.length;
    console.info(`Found ${totalUrls} URLs to process.`);

    // Filter URLs based on remaining quota (cheap pre-check)
    const allowedUrls: string[] = [];
    for (const url of allUrls) {
      if (incrementAndPersist(GOOGLE_STORE, GOOGLE_CONTEXT, DAILY_GOOGLE_LIMIT_CONFIG, INDEXING_RATE_LIMIT_PATH)) {
        allowedUrls.push(url);
      } else {
        console.warn(`[Google] Daily limit reached – skipping remaining URLs.`);
        break;
      }
    }

    if (allowedUrls.length) {
      const batchSize = 50; // Google allows 100; our quota is 50
      for (let i = 0; i < allowedUrls.length; i += batchSize) {
        const batch = allowedUrls.slice(i, i + batchSize);
        console.info(`[Google] Submitting batch ${i / batchSize + 1}`);

        for (const url of batch) {
          const result = await notifyGoogle(url, "URL_UPDATED");
          if (result) {
            console.info(`[Google] Successfully submitted ${url}`);
            await persistRateLimitStoreToS3(GOOGLE_STORE, INDEXING_RATE_LIMIT_PATH);
          }
        }

        if (i + batchSize < allowedUrls.length) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
      console.info("[Google] URL-level submission complete");
    } else {
      console.info("No quota available for URL submissions – skipping");
    }
  } else if (DEBUG_MODE) {
    console.info("[Google] Per-URL Indexing-API submission disabled – sitemap ping only");
  }

  // ---------------------------------------------------------------------
  // Sitemap pings
  // ---------------------------------------------------------------------

  const BASE_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://williamcallahan.com";
  const sitemapUrl = `${BASE_SITE_URL.replace(/\/$/, "")}/sitemap.xml`;

  // Verify sitemap is reachable before pinging search engines
  let sitemapReachable = true;
  try {
    const headRes = await fetch(sitemapUrl, { method: "HEAD" });
    sitemapReachable = headRes.ok;
    if (!sitemapReachable) {
      console.error(`[Local] Sitemap not reachable at ${sitemapUrl}. Status: ${headRes.status}`);
    }
  } catch {
    sitemapReachable = false;
    console.error(`[Local] Failed to fetch sitemap at ${sitemapUrl}`);
  }

  if (sitemapReachable) {
    // Google anonymous ping
    try {
      const googlePingUrl = `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`;
      const res = await fetch(googlePingUrl);
      if (res.ok) {
        console.info("[Google] Sitemap ping successful.");
      } else {
        console.error(`[Google] Sitemap ping failed. Status: ${res.status}`);
      }
    } catch (err) {
      console.error("[Google] Error during sitemap ping:", err);
    }
  } else if (DEBUG_MODE) {
    console.info("[Google] Skipping ping because sitemap not reachable (dev environment?)");
  }

  // Bing IndexNow ping
  const bingSubmissionUrl = `https://www.bing.com/webmaster/ping.aspx?siteMap=${sitemapUrl}`;

  try {
    const response = await fetch(bingSubmissionUrl);
    if (response.ok) {
      console.info("[Bing] Sitemap submitted successfully.");
    } else {
      console.error(`[Bing] Failed to submit sitemap. Status: ${response.status}`);
    }
  } catch (err) {
    console.error("[Bing] An error occurred during sitemap submission:", err);
  }
};

main().catch((err) => {
  console.error("An unexpected error occurred in the main process:", err);
  process.exit(1);
});
