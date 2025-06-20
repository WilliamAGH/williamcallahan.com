#!/usr/bin/env ts-node

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
 * - `bun scripts/submit-sitemap.ts` - Run both sitemap and individual URL submissions
 * - `bun scripts/submit-sitemap.ts --sitemaps-only` - Run only sitemap submissions
 * - `bun scripts/submit-sitemap.ts --individual-only` - Run only individual URL submissions
 * - `bun scripts/submit-sitemap.ts --all` - Explicitly run both (same as no args)
 */

import "dotenv/config";
import type { GaxiosError, GaxiosResponse } from "gaxios";
import { type Auth, google } from "googleapis";
import type { MetadataRoute } from "next";
import type { GoogleIndexingUrlNotificationMetadata } from "@/types/lib";
import sitemap from "../app/sitemap.ts";

/**
 * Delay in milliseconds between individual URL submissions to the Google Indexing API.
 * Used to respect API rate limits and prevent overwhelming the service.
 * @constant {number}
 */
const INDEXING_API_DELAY_MS = 1000; // 1 second delay

/**
 * Expected production site URL for validation purposes.
 * Submissions only occur when NEXT_PUBLIC_SITE_URL matches this value.
 * @constant {string}
 */
const EXPECTED_PRODUCTION_SITE_URL = "https://williamcallahan.com";

/**
 * Time window in milliseconds for considering URLs as "recently updated".
 * Only URLs modified within this timeframe are submitted to Google Indexing API.
 * @constant {number}
 */
const FOURTEEN_DAYS_IN_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Processes the Google Service Account private key from environment variable.
 * Handles various formatting issues common with environment variables:
 * - Replaces literal '\n' strings with actual newline characters
 * - Removes surrounding quotes if present
 * - Validates the presence of the private key end marker
 *
 * @param {string | undefined} rawPrivateKey - The raw private key string from environment
 * @returns {string | null} The processed private key ready for use, or null if invalid
 */
function processGooglePrivateKey(rawPrivateKey: string | undefined): string | null {
  if (!rawPrivateKey) {
    console.error("[GoogleAuth] Private key is undefined.");
    return null;
  }

  // Replace literal newline strings with actual newlines
  let processedKey = rawPrivateKey.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n");
  processedKey = processedKey.trim();

  // Remove surrounding quotes if present
  if (processedKey.startsWith('"') && processedKey.endsWith('"')) {
    processedKey = processedKey.substring(1, processedKey.length - 1).trim();
  }

  // Ensure the private key has the correct end marker
  const endMarker = "-----END PRIVATE KEY-----";
  const indexOfEndMarker = processedKey.lastIndexOf(endMarker);
  if (indexOfEndMarker !== -1) {
    processedKey = `${processedKey.substring(0, indexOfEndMarker + endMarker.length)}\n`;
  } else {
    console.error(
      "[GoogleAuth] ERROR: Private key does not appear to contain the END marker. Check .env variable GOOGLE_SEARCH_INDEXING_SA_PRIVATE_KEY.",
    );
    return null;
  }

  return processedKey;
}

/**
 * Creates an authenticated Google API JWT client for accessing Google services.
 * Validates all required environment variables before creating the client.
 *
 * @returns {Auth.JWT | null} An authenticated JWT client or null if configuration is missing
 */
function getGoogleAuthClient(): Auth.JWT | null {
  const clientEmail = process.env.GOOGLE_SEARCH_INDEXING_SA_EMAIL;
  const rawPrivateKey = process.env.GOOGLE_SEARCH_INDEXING_SA_PRIVATE_KEY;
  const projectId = process.env.GOOGLE_PROJECT_ID;

  if (!clientEmail || !rawPrivateKey || !projectId) {
    console.error("[GoogleAuth] ❌ Missing Google Service Account email, private key, or project ID in .env.");
    return null;
  }

  const privateKey = processGooglePrivateKey(rawPrivateKey);
  if (!privateKey) {
    return null;
  }

  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/webmasters", "https://www.googleapis.com/auth/indexing"],
    subject: undefined,
  });
}

/**
 * Submits the sitemap to Google Search Console using the Webmasters API.
 *
 * @param {Auth.JWT} authClient - Authenticated Google JWT client
 * @param {string} siteUrl - The site URL for which the sitemap is being submitted
 * @param {string} sitemapUrl - The full URL of the sitemap.xml file
 * @returns {Promise<boolean>} True if submission was successful, false otherwise
 */
async function submitSitemapToGoogle(authClient: Auth.JWT, siteUrl: string, sitemapUrl: string): Promise<boolean> {
  try {
    const webmasters = google.webmasters({ version: "v3", auth: authClient });
    await webmasters.sitemaps.submit({
      siteUrl: siteUrl,
      feedpath: sitemapUrl,
    });
    console.log(
      `[SitemapSubmitGoogle] ✅ Successfully submitted sitemap (${sitemapUrl}) to Google for site ${siteUrl}`,
    );
    return true;
  } catch (error) {
    const gaxiosError = error as GaxiosError;
    console.error(
      "[SitemapSubmitGoogle] ❌ Error submitting to Google:",
      gaxiosError.message,
      gaxiosError.response?.data,
    );
    return false;
  }
}

/**
 * Submits the sitemap to Bing via IndexNow protocol.
 * IndexNow is a simple way to notify search engines about content updates.
 *
 * @param {string} siteUrl - The site URL for which the sitemap is being submitted
 * @param {string} sitemapUrl - The full URL of the sitemap.xml file
 * @returns {Promise<boolean>} True if submission was successful, false otherwise
 */
async function submitSitemapToBing(siteUrl: string, sitemapUrl: string): Promise<boolean> {
  const indexNowKey = process.env.INDEXNOW_KEY;
  if (!indexNowKey) {
    console.error("[SitemapSubmitBing] ❌ INDEXNOW_KEY not set. Skipping Bing/IndexNow submission.");
    return false;
  }

  try {
    const host = new URL(siteUrl).host;
    const indexnowUrl = `https://www.bing.com/indexnow?url=${encodeURIComponent(sitemapUrl)}&key=${indexNowKey}&host=${host}`;
    const response = await fetch(indexnowUrl, { method: "GET" });

    if (response.ok) {
      console.log(`[SitemapSubmitBing] ✅ Successfully submitted sitemap (${sitemapUrl}) via IndexNow to Bing`);
      return true;
    }

    console.error(`[SitemapSubmitBing] ❌ IndexNow submission failed: ${response.status} ${response.statusText}`);
    return false;
  } catch (error) {
    const e = error as Error;
    console.error("[SitemapSubmitBing] ❌ Error submitting via IndexNow to Bing:", e.message);
    return false;
  }
}

/**
 * Orchestrates sitemap submissions to Google and Bing search engines.
 *
 * This function:
 * - Validates environment (production only)
 * - Validates site URL matches expected production URL
 * - Submits sitemap to both Google Search Console and Bing
 * - Logs detailed success/failure status for each submission
 * - Handles partial failures gracefully
 *
 * @export
 * @async
 * @returns {Promise<void>} A promise that resolves when all submissions are attempted
 */
export async function submitSitemapFilesToSearchEngines(): Promise<void> {
  const currentSiteUrlFromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "";
  const nodeEnv = process.env.NODE_ENV;

  // Validate environment
  if (nodeEnv !== "production") {
    console.log(`[SitemapSubmit] ℹ️ NODE_ENV is '${nodeEnv}'. Sitemap submissions are skipped (requires 'production').`);
    return;
  }

  // Validate site URL
  if (currentSiteUrlFromEnv !== EXPECTED_PRODUCTION_SITE_URL) {
    console.log(
      `[SitemapSubmit] ℹ️ NEXT_PUBLIC_SITE_URL ('${currentSiteUrlFromEnv}') does not match expected '${EXPECTED_PRODUCTION_SITE_URL}'. Sitemap submissions skipped.`,
    );
    return;
  }

  const sitemapUrl = `${currentSiteUrlFromEnv}/sitemap.xml`;
  console.log(
    `[SitemapSubmit] Starting sitemap submission for ${sitemapUrl} (Env: ${nodeEnv}, URL: ${currentSiteUrlFromEnv})`,
  );

  // Get Google auth client
  const authClient = getGoogleAuthClient();
  if (!authClient) {
    console.error("[SitemapSubmit] ❌ Could not create Google Auth client. Aborting Google sitemap submission.");
  }

  // Submit to both services in parallel
  const results = await Promise.allSettled([
    authClient ? submitSitemapToGoogle(authClient, currentSiteUrlFromEnv, sitemapUrl) : Promise.resolve(false),
    submitSitemapToBing(currentSiteUrlFromEnv, sitemapUrl),
  ]);

  const googleResult = results[0];
  const bingResult = results[1];

  const googleSuccess = googleResult.status === "fulfilled" && googleResult.value;
  const bingSuccess = bingResult.status === "fulfilled" && bingResult.value;

  // Log any rejected promises for debugging
  if (googleResult.status === "rejected") {
    console.error("[SitemapSubmit] Google submission promise rejected:", googleResult.reason);
  }
  if (bingResult.status === "rejected") {
    console.error("[SitemapSubmit] Bing submission promise rejected:", bingResult.reason);
  }

  // Report results
  let successCount = 0;
  if (googleSuccess) successCount++;
  if (bingSuccess) successCount++;

  console.log(
    `[SitemapSubmit] Sitemap submission process complete: ${successCount}/2 search engines potentially notified.`,
  );
}

/**
 * Gets the last notification status for a URL from Google Indexing API.
 * Used to avoid re-submitting URLs that have already been recently notified.
 *
 * @param {string} urlToQuery - The URL to check for existing notifications
 * @param {Auth.JWT} authClient - Authenticated Google JWT client
 * @returns {Promise<string | null>} The notifyTime (ISO string) if available, otherwise null
 */
async function getGoogleUrlNotificationStatus(urlToQuery: string, authClient: Auth.JWT): Promise<string | null> {
  try {
    const metadataUrl = `https://indexing.googleapis.com/v3/urlNotifications/metadata?url=${encodeURIComponent(urlToQuery)}`;

    const response: GaxiosResponse<GoogleIndexingUrlNotificationMetadata> =
      await authClient.request<GoogleIndexingUrlNotificationMetadata>({
        url: metadataUrl,
        method: "GET",
      });

    if (response.data?.latestUpdate?.notifyTime) {
      console.log(
        `[GoogleIndexStatus] ℹ️ Status for ${urlToQuery}: Last notifyTime ${response.data.latestUpdate.notifyTime}`,
      );
      return response.data.latestUpdate.notifyTime;
    }

    console.log(`[GoogleIndexStatus] ℹ️ No previous notification status found for ${urlToQuery}.`);
    return null;
  } catch (error) {
    const gaxiosError = error as GaxiosError;
    if (gaxiosError.response?.status === 404) {
      console.log(`[GoogleIndexStatus] ℹ️ URL ${urlToQuery} not found in Indexing API (never submitted or expired).`);
      return null;
    }
    console.error(
      `[GoogleIndexStatus] ❌ Error getting notification status for ${urlToQuery}:`,
      gaxiosError.message,
      gaxiosError.response?.data,
    );
    return null;
  }
}

/**
 * Submits a single URL to the Google Indexing API.
 *
 * @param {string} urlToSubmit - The URL to submit for indexing
 * @param {'URL_UPDATED' | 'URL_DELETED'} type - The type of notification to send
 * @param {Auth.JWT} authClient - Authenticated Google JWT client
 * @returns {Promise<boolean>} True if submission was successful, false otherwise
 */
async function submitUrlToGoogleIndexingAPI(
  urlToSubmit: string,
  type: "URL_UPDATED" | "URL_DELETED",
  authClient: Auth.JWT,
): Promise<boolean> {
  try {
    const endpoint = "https://indexing.googleapis.com/v3/urlNotifications:publish";
    const body = {
      url: urlToSubmit,
      type: type,
    };

    await authClient.request<unknown>({ url: endpoint, method: "POST", data: body });

    console.log(
      `[GoogleIndexSubmit] ✅ Successfully submitted URL (${urlToSubmit}), Type (${type}) to Google Indexing API.`,
    );
    return true;
  } catch (error) {
    const gaxiosError = error as GaxiosError;
    console.error(
      `[GoogleIndexSubmit] ❌ Error submitting URL ${urlToSubmit} to Indexing API:`,
      gaxiosError.message,
      gaxiosError.response?.data,
    );
    return false;
  }
}

/**
 * Processes individual sitemap entries and submits recently updated URLs to the Google Indexing API.
 *
 * This function:
 * - Validates environment (production only)
 * - Validates site URL matches expected production URL
 * - Filters sitemap entries to find recently updated URLs (within 14 days)
 * - Checks existing notification status to avoid duplicate submissions
 * - Submits eligible URLs with rate limiting delays
 * - Provides comprehensive logging of the process
 *
 * @export
 * @async
 * @returns {Promise<void>} A promise that resolves when all eligible URLs have been processed
 */
export async function submitIndividualUrlsToGoogle(): Promise<void> {
  const nodeEnv = process.env.NODE_ENV;
  const currentSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "";

  // Validate environment
  if (nodeEnv !== "production") {
    console.log(`[IndividualSubmit] ℹ️ NODE_ENV is '${nodeEnv}'. Skipping individual URL submissions.`);
    return;
  }

  // Validate site URL
  if (currentSiteUrl !== EXPECTED_PRODUCTION_SITE_URL) {
    console.log(
      `[IndividualSubmit] ℹ️ NEXT_PUBLIC_SITE_URL ('${currentSiteUrl}') does not match expected '${EXPECTED_PRODUCTION_SITE_URL}'. Skipping individual URL submissions.`,
    );
    return;
  }

  // Get Google auth client
  const authClient = getGoogleAuthClient();
  if (!authClient) {
    console.error("[IndividualSubmit] ❌ Could not create Google Auth client. Aborting individual URL submissions.");
    return;
  }

  console.log(`[IndividualSubmit] Starting individual URL submission (Env: ${nodeEnv}, Base URL: ${currentSiteUrl})`);

  try {
    const entries: MetadataRoute.Sitemap = await sitemap();
    let processedCount = 0;
    let submittedCount = 0;

    for (const entry of entries) {
      processedCount++;
      const postUrl = entry.url;
      const lastMod = entry.lastModified;

      // Parse lastModified date
      let lastModifiedDate: Date | undefined;
      if (lastMod instanceof Date) {
        lastModifiedDate = lastMod;
      } else if (typeof lastMod === "string") {
        lastModifiedDate = new Date(lastMod);
      } else {
        continue; // Skip entries without valid lastModified
      }

      // Validate date and check if within recent window
      if (Number.isNaN(lastModifiedDate.getTime())) continue;
      if (Date.now() - lastModifiedDate.getTime() > FOURTEEN_DAYS_IN_MS) continue;

      console.log(`[IndividualSubmit] 🔎 Checking ${postUrl} (Modified: ${lastModifiedDate.toISOString()})`);

      // Check if already notified recently
      const notifiedAt = await getGoogleUrlNotificationStatus(postUrl, authClient);
      if (notifiedAt && new Date(notifiedAt) >= lastModifiedDate) continue;

      // Submit the URL
      console.log(`[IndividualSubmit] 🚀 Submitting ${postUrl} to Indexing API.`);
      const success = await submitUrlToGoogleIndexingAPI(postUrl, "URL_UPDATED", authClient);
      if (success) submittedCount++;

      // Add delay between requests to respect rate limits
      if (processedCount < entries.length) {
        await new Promise((resolve) => setTimeout(resolve, INDEXING_API_DELAY_MS));
      }
    }

    console.log(`[IndividualSubmit] Processed ${processedCount}, submitted ${submittedCount} URLs.`);
  } catch (error) {
    console.error("[IndividualSubmit] ❌ Error processing sitemap entries:", (error as Error).message);
  }
}

/**
 * Main execution function that handles command line arguments and orchestrates submissions.
 *
 * Supported arguments:
 * - No args: Run both sitemap and individual URL submissions
 * - --sitemaps-only: Run only sitemap submissions
 * - --individual-only: Run only individual URL submissions
 * - --all: Explicitly run both (same as no args)
 *
 * @async
 * @returns {Promise<void>} A promise that resolves when all requested submissions are complete
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  let runSitemaps = true;
  let runIndividual = true;

  if (args.length > 0) {
    runSitemaps = args.includes("--sitemaps-only") || args.includes("--all");
    runIndividual = args.includes("--individual-only") || args.includes("--all");

    if (!args.includes("--sitemaps-only") && !args.includes("--individual-only") && !args.includes("--all")) {
      console.log("No specific tasks requested via args, running both sitemap and individual URL submissions.");
    }
  } else {
    console.log("No arguments provided, running both sitemap and individual URL submissions by default.");
  }

  if (runSitemaps) {
    console.log("\n--- Running Sitemap Files Submission ---");
    await submitSitemapFilesToSearchEngines();
  }

  if (runIndividual) {
    console.log("\n--- Running Individual URL Submission to Google ---");
    await submitIndividualUrlsToGoogle();
  }

  console.log("\n--- All requested submissions attempted. ---");
}

// Execute main function when script is run directly
if (import.meta.main) {
  main().catch((error) => {
    console.error("[SitemapSubmitScript] Unhandled top-level error:", error);
    process.exit(1);
  });
}
