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
import { GaxiosError } from "gaxios";
import type { GoogleIndexingUrlNotificationMetadata } from "@/types/lib";
import type { UrlNotification, IndexingApiResponse } from "@/types/api";
import sitemap from "../app/sitemap";
import { loadRateLimitStoreFromS3, incrementAndPersist, persistRateLimitStoreToS3 } from "@/lib/rate-limiter";
import { INDEXING_RATE_LIMIT_PATH } from "@/lib/constants";

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

// ---------------------------------------------------------------------------
// IndexNow key file helper
//   The verification text file MUST live at the web-root:  /public/<key>.txt
//   e.g. `public/bc4df0455a374597950eb9199509f599.txt`
//   This is then served at: https://williamcallahan.com/bc4df0455a374597950eb9199509f599.txt
// ---------------------------------------------------------------------------
const INDEXNOW_KEY_ENV = process.env.INDEXNOW_KEY ?? "";
/**
 * The key file name, derived from the key. e.g. `bc4df0455a374597950eb9199509f599.txt`
 * This file must exist in the `public/` directory.
 */
const INDEXNOW_KEY_FILE = INDEXNOW_KEY_ENV ? `${INDEXNOW_KEY_ENV}.txt` : "";

/** Normalizes Google service-account private key from env (handles escaped newlines, base64, or multiline PEM) */
function processGooglePrivateKey(key?: string): string {
  if (!key) throw new Error("GOOGLE_SEARCH_INDEXING_SA_PRIVATE_KEY env var is missing.");

  let processed = key.includes("\\n") ? key.replace(/\\n/g, "\n") : key;

  if (!processed.startsWith("-----BEGIN")) {
    try {
      const decoded = Buffer.from(processed, "base64").toString("utf-8");
      if (decoded.startsWith("-----BEGIN")) processed = decoded;
    } catch {
      // fall through – decoding failed, we'll validate later
    }
  }

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
  try {
    const response = await authClient.request<IndexingApiResponse>({
      url: "https://indexing.googleapis.com/v3/urlNotifications:publish",
      method: "POST",
      data: { url, type } as UrlNotification,
    });

    if (response.data?.urlNotificationMetadata) {
      return response.data.urlNotificationMetadata as GoogleIndexingUrlNotificationMetadata;
    }
    console.error(`${LOG_PREFIX.google} Unexpected response format for ${url}:`, response.data);
    return null;
  } catch (err: unknown) {
    if (err instanceof GaxiosError) {
      console.error(
        `${LOG_PREFIX.google} Error submitting ${url}: ${err.response?.status} ${err.response?.statusText}`,
      );
      console.error(`${LOG_PREFIX.google} Error details:`, err.response?.data);
    } else {
      console.error(`${LOG_PREFIX.google} Unexpected error for ${url}:`, err);
    }
    return null;
  }
}

if (GOOGLE_ONLY && INDEXNOW_ONLY) {
  console.warn("Both --google-only and --indexnow-only supplied – defaulting to sending to both.");
}

async function submitGoogleSitemap(sitemapUrl: string, siteUrl: string): Promise<void> {
  try {
    const res = await authClient.request({
      url: `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(sitemapUrl)}`,
      method: "PUT",
    });

    if (res.status === 200 || res.status === 204) {
      console.info(`${LOG_PREFIX.google} Sitemap submitted successfully via Search Console API → ${sitemapUrl}`);
    } else {
      console.error(`${LOG_PREFIX.google} Sitemap submission failed. Status: ${res.status}`);
    }
  } catch (err: unknown) {
    console.error(`${LOG_PREFIX.google} Error while submitting sitemap:`, err);
  }
}

const main = async (): Promise<void> => {
  // Handle URL indexing if enabled
  if (URL_INDEXING_ENABLED) {
    await processUrlIndexing();
  } else if (DEBUG_MODE) {
    console.info(`${LOG_PREFIX.google} Per-URL Indexing-API submission disabled – sitemap ping only`);
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

  const siteUrlCanonical = submissionSiteUrl.endsWith("/") ? submissionSiteUrl : `${submissionSiteUrl}/`;
  const sitemapUrl = `${siteUrlCanonical}sitemap.xml`;

  // Submit to Google
  if (!SKIP_GOOGLE) await submitToGoogle(sitemapUrl, siteUrlCanonical);
  else if (DEBUG_MODE) console.info(`${LOG_PREFIX.google} Skipped due to CLI flag.`);

  // Submit to IndexNow
  if (!SKIP_INDEXNOW) await submitToIndexNow(siteUrlCanonical);
  else if (DEBUG_MODE) console.info(`${LOG_PREFIX.indexNow} Skipped due to CLI flag.`);
};

async function processUrlIndexing(): Promise<void> {
  await loadRateLimitStoreFromS3(GOOGLE_STORE, INDEXING_RATE_LIMIT_PATH);

  const allUrls = sitemap().map((u) => u.url);
  const totalUrls = allUrls.length;
  console.info(`Found ${totalUrls} URLs to process.`);

  // Filter URLs based on remaining quota
  const allowedUrls: string[] = [];
  for (const url of allUrls) {
    if (incrementAndPersist(GOOGLE_STORE, GOOGLE_CONTEXT, DAILY_GOOGLE_LIMIT_CONFIG, INDEXING_RATE_LIMIT_PATH)) {
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
      const result = await notifyGoogle(url, "URL_UPDATED");
      if (result) {
        console.info(`${LOG_PREFIX.google} Successfully submitted ${url}`);
        await persistRateLimitStoreToS3(GOOGLE_STORE, INDEXING_RATE_LIMIT_PATH);
      }
    }

    if (i + batchSize < allowedUrls.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  console.info(`${LOG_PREFIX.google} URL-level submission complete`);
}

async function submitToGoogle(sitemapUrl: string, siteUrlCanonical: string): Promise<void> {
  if (!process.env.GOOGLE_SEARCH_INDEXING_SA_EMAIL || !process.env.GOOGLE_SEARCH_INDEXING_SA_PRIVATE_KEY) {
    if (DEBUG_MODE)
      console.warn(`${LOG_PREFIX.google} Skipping sitemap submission – Google service-account env vars are missing.`);
    return;
  }
  await submitGoogleSitemap(sitemapUrl, process.env.GOOGLE_SEARCH_CONSOLE_PROPERTY ?? siteUrlCanonical);
}

/**
 * Submits the sitemap to the IndexNow API.
 *
 * This function requires the `INDEXNOW_KEY` environment variable to be set. This key must
 * correspond to a verification file located in the `public/` directory. For example,
 * if the key is `bc4df0455a374597950eb9199509f599`, a file named
 * `public/bc4df0455a374597950eb9199509f599.txt` must exist and contain the key.
 *
 * @param siteUrlCanonical The canonical URL of the site, used for constructing the `keyLocation`.
 * @see https://www.indexnow.org/documentation
 * @see https://www.bing.com/indexnow/getstarted
 */
async function submitToIndexNow(siteUrlCanonical: string): Promise<void> {
  const INDEXNOW_KEY = INDEXNOW_KEY_ENV;
  if (!INDEXNOW_KEY) {
    if (DEBUG_MODE) console.warn(`${LOG_PREFIX.indexNow} Skipping – INDEXNOW_KEY env var not set.`);
    return;
  }
  if (!/^[a-f0-9-]{32,}$/i.test(INDEXNOW_KEY)) {
    console.error(`${LOG_PREFIX.indexNow} Invalid INDEXNOW_KEY format – must be a valid UUID or similar identifier.`);
    return;
  }

  // Verify key file only when not running from localhost
  const keyLocationUrl = `${siteUrlCanonical}${INDEXNOW_KEY_FILE}`;
  if (!isLocalhost) {
    const keyValid = await verifyIndexNowKey(keyLocationUrl, INDEXNOW_KEY);
    if (!keyValid) return;
  }

  try {
    const urlList = sitemap().map((u) => u.url);

    // Build payload per IndexNow spec
    const payload: Record<string, unknown> = {
      host: new URL(siteUrlCanonical).host,
      key: INDEXNOW_KEY,
      urlList,
    };

    // Always include `keyLocation` – some providers require explicit path even when using root verification (empirical 403 fix)
    payload.keyLocation = keyLocationUrl;

    if (DEBUG_MODE) {
      console.info(`${LOG_PREFIX.indexNow} Submitting with payload:`, JSON.stringify(payload, null, 2));
    }

    const aggregatorEndpoint = "https://api.indexnow.org/indexnow";
    const bingEndpoint = "https://www.bing.com/indexnow";

    const attemptSubmit = async (endpoint: string): Promise<Response> => {
      return fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(payload),
      });
    };

    let res = await attemptSubmit(aggregatorEndpoint);
    if (res.status === 403) {
      console.warn(`${LOG_PREFIX.indexNow} Aggregator returned 403 – retrying via Bing endpoint.`);
      res = await attemptSubmit(bingEndpoint);
    }

    // Log response
    if (res.ok) {
      console.info(`${LOG_PREFIX.indexNow} Payload accepted. Submitted ${urlList.length} URLs`);
    } else {
      const bodyText = await res.text().catch(() => "<body unavailable>");
      console.error(`${LOG_PREFIX.indexNow} Submission failed. Status: ${res.status}. Response: ${bodyText}`);
    }
  } catch (err) {
    console.error(`${LOG_PREFIX.indexNow} Error while submitting payload:`, err);
  }
}

async function verifyIndexNowKey(keyLocationUrl: string, expectedKey: string): Promise<boolean> {
  try {
    const keyRes = await fetch(keyLocationUrl, { method: "GET" });
    const body = await keyRes.text();

    if (!keyRes.ok) {
      console.error(
        `${LOG_PREFIX.indexNow} keyLocation ${keyLocationUrl} returned HTTP ${keyRes.status}. Aborting submission.`,
      );
      return false;
    }

    if (body.trim() !== expectedKey) {
      console.error(
        `${LOG_PREFIX.indexNow} keyLocation file content mismatch. Expected '${expectedKey}', got '${body.trim()}'. Aborting submission.`,
      );
      return false;
    }

    return true;
  } catch (verifyErr) {
    console.error(`${LOG_PREFIX.indexNow} Failed to verify keyLocation (${keyLocationUrl}):`, verifyErr);
    return false;
  }
}

main().catch((err) => {
  console.error("An unexpected error occurred in the main process:", err);
  process.exit(1);
});
