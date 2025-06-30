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
import sitemap from "../app/sitemap";
import { loadRateLimitStoreFromS3, incrementAndPersist, persistRateLimitStoreToS3 } from "@/lib/rate-limiter";
import { INDEXING_RATE_LIMIT_PATH } from "@/lib/constants";

/**
 * Normalizes the service-account private key coming from environment variables
 *
 * Google keys can arrive in three shapes:
 *   1. One-line string where newline characters are escaped ("\n") – typical when
 *      the JSON key is copied into an env file
 *   2. Base-64-encoded PEM block – common when secrets managers strip newlines
 *   3. Multiline PEM string already containing real newlines (Kubernetes / Cloud-run secrets)
 *
 * This script supports all three - the output is always a valid PEM string
 * starting with "-----BEGIN PRIVATE KEY-----" and containing *real* newlines
 */
function processGooglePrivateKey(key?: string): string {
  if (!key) {
    throw new Error("GOOGLE_SEARCH_INDEXING_SA_PRIVATE_KEY env var is missing.");
  }

  let processed = key;

  // Case 1: escaped newlines – replace with real newlines
  if (processed.includes("\\n")) {
    processed = processed.replace(/\\n/g, "\n");
  }

  // Case 2: base64 – try to decode and see if we get a PEM header
  if (!processed.startsWith("-----BEGIN")) {
    try {
      const decoded = Buffer.from(processed, "base64").toString("utf-8");
      if (decoded.startsWith("-----BEGIN")) {
        processed = decoded;
      }
    } catch {
      // fall through – decoding failed, we'll validate later
    }
  }

  // Final validation – must contain PEM header
  if (!processed.startsWith("-----BEGIN PRIVATE KEY-----")) {
    throw new Error("GOOGLE_SEARCH_INDEXING_SA_PRIVATE_KEY does not appear to be a valid PEM formatted private key.");
  }

  return processed;
}

// The same service-account credential is re-used for both the Indexing API and
// the Search Console API (sitemaps.submit) endpoint - this requests both scopes
// up-front so it doesn't need two separate JWT instances
const authClient = new JWT({
  email: process.env.GOOGLE_SEARCH_INDEXING_SA_EMAIL,
  key: processGooglePrivateKey(process.env.GOOGLE_SEARCH_INDEXING_SA_PRIVATE_KEY),
  scopes: [
    "https://www.googleapis.com/auth/indexing",
    "https://www.googleapis.com/auth/webmasters", // required for Search Console sitemap submission
  ],
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
// Google deprecated generic per-URL Indexing API submissions for standard web
// content (except verticals such as JobPosting, BroadcastEvent, etc.).  We now
// rely solely on sitemap submissions for Google.  Force-disable the direct
// URL submission path.
// ---------------------------------------------------------------------------
const URL_INDEXING_ENABLED = false;

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------
const DEBUG_MODE = process.argv.includes("--debug");

// ---------------------------------------------------------------------------
// Google Search Console – Sitemap submission (2025 method)
// Reference: https://developers.google.com/webmaster-tools/v1/sitemaps/submit
// ---------------------------------------------------------------------------

async function submitGoogleSitemap(sitemapUrl: string, siteUrl: string): Promise<void> {
  try {
    const encodedSite = encodeURIComponent(siteUrl);
    const encodedSitemap = encodeURIComponent(sitemapUrl);

    const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/sitemaps/${encodedSitemap}`;

    const res = await authClient.request({
      url: endpoint,
      method: "PUT",
    });

    if (res.status === 200 || res.status === 204) {
      console.info(`[Google] Sitemap submitted successfully via Search Console API → ${sitemapUrl}`);
    } else {
      console.error(`[Google] Sitemap submission failed. Status: ${res.status}`);
    }
  } catch (err: unknown) {
    console.error("[Google] Error while submitting sitemap:", err);
  }
}

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

  // -------------------------------------------------------------------
  // Modern endpoints
  //   • Google: already handled above via Indexing API when
  //     URL_INDEXING_ENABLED === true.
  //   • Bing (+ Yandex, Naver, Seznam, Yep): use IndexNow protocol.
  // -------------------------------------------------------------------

  // Always attempt Search Console sitemap submission if credentials are present.
  const BASE_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://williamcallahan.com";
  const siteUrlCanonical = BASE_SITE_URL.endsWith("/") ? BASE_SITE_URL : `${BASE_SITE_URL}/`;
  const sitemapUrl = `${siteUrlCanonical}sitemap.xml`;

  if (process.env.GOOGLE_SEARCH_INDEXING_SA_EMAIL && process.env.GOOGLE_SEARCH_INDEXING_SA_PRIVATE_KEY) {
    await submitGoogleSitemap(sitemapUrl, siteUrlCanonical);
  } else if (DEBUG_MODE) {
    console.warn("[Google] Skipping sitemap submission – Google service-account env vars are missing.");
  }

  // Submit an IndexNow payload if the key is available.
  const INDEXNOW_KEY = process.env.INDEXNOW_KEY;

  if (!INDEXNOW_KEY) {
    if (DEBUG_MODE) {
      console.warn("[IndexNow] Skipping – INDEXNOW_KEY env var not set.");
    }
  } else if (!/^[a-f0-9-]{32,}$/i.test(INDEXNOW_KEY)) {
    console.error("[IndexNow] Invalid INDEXNOW_KEY format – must be a valid UUID or similar identifier.");
  } else {
    try {
      // Prepare payload following IndexNow JSON specification
      const payload = {
        host: new URL(BASE_SITE_URL).host,
        key: INDEXNOW_KEY,
        keyLocation: `${siteUrlCanonical}${INDEXNOW_KEY}.txt`,
        urlList: sitemap().map((u) => u.url),
      } as const;

      const res = await fetch("https://api.indexnow.org/indexnow", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        console.info("[IndexNow] Payload accepted. Submitted", payload.urlList.length, "URLs");
      } else {
        console.error(`[IndexNow] Submission failed. Status: ${res.status}`);
      }
    } catch (err) {
      console.error("[IndexNow] Error while submitting payload:", err);
    }
  }
};

main().catch((err) => {
  console.error("An unexpected error occurred in the main process:", err);
  process.exit(1);
});
