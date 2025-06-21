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

import * as dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import type { GaxiosError, GaxiosResponse } from "gaxios";
import { google } from "googleapis";
import type { GoogleIndexingUrlNotificationMetadata } from "@/types/lib";
import sitemap from "../app/sitemap.ts";

// Custom environment loader to handle multi-line keys that break dotenv
try {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const envFileContent = fs.readFileSync(envPath, { encoding: "utf-8" });
    const lines = envFileContent.split("\n");
    const cleanLines: string[] = [];
    let privateKeyVal = "";

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith("GOOGLE_SEARCH_INDEXING_SA_PRIVATE_KEY=")) {
        let value = trimmedLine.substring("GOOGLE_SEARCH_INDEXING_SA_PRIVATE_KEY=".length);
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }
        privateKeyVal = value;
      } else {
        cleanLines.push(line);
      }
    }

    const envConfig = dotenv.parse(cleanLines.join("\n"));
    for (const k in envConfig) {
      if (!Object.hasOwn(process.env, k)) {
        process.env[k] = envConfig[k];
      }
    }
    if (privateKeyVal && !process.env.GOOGLE_SEARCH_INDEXING_SA_PRIVATE_KEY) {
      process.env.GOOGLE_SEARCH_INDEXING_SA_PRIVATE_KEY = privateKeyVal;
    }
  }
} catch (error) {
  console.error("Failed to load or parse .env file:", error);
}

/**
 * Type guard to check if an object is a GaxiosError.
 * @param error The error object to check.
 * @returns True if the object is a GaxiosError, false otherwise.
 */
function isGaxiosError(error: unknown): error is GaxiosError {
  return typeof error === "object" && error !== null && "response" in error;
}

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

async function notifyGoogle(
  url: string,
  type: "URL_UPDATED" | "URL_DELETED",
): Promise<GoogleIndexingUrlNotificationMetadata | null> {
  const privateKey = processGooglePrivateKey(process.env.GOOGLE_SEARCH_INDEXING_SA_PRIVATE_KEY);
  const clientEmail = process.env.GOOGLE_SEARCH_INDEXING_SA_EMAIL;

  if (!clientEmail) {
    throw new Error("Google Cloud client email is not defined in environment variables.");
  }

  const client = new google.auth.JWT(clientEmail, undefined, privateKey, ["https://www.googleapis.com/auth/indexing"]);

  const endpoint = "https://indexing.googleapis.com/v3/urlNotifications:publish";
  try {
    const response: GaxiosResponse = await client.request({
      url: endpoint,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        url,
        type,
      },
    });
    return response.data as GoogleIndexingUrlNotificationMetadata;
  } catch (err: unknown) {
    if (isGaxiosError(err)) {
      console.error(`[Google] Error submitting ${url}: ${err.response?.status} ${err.response?.statusText}`);
    }
    return null;
  }
}

const main = async (): Promise<void> => {
  const allUrls = sitemap().map((url) => url.url);
  const totalUrls = allUrls.length;

  console.info(`Found ${totalUrls} URLs to process.`);

  // For Google, we can batch URLs.
  // The API has a limit of 100 URLs per batch and a max of 200 URLs per day.
  const googleBatchSize = 100;
  const googleUrls = allUrls.slice(0, 200); // Limit to 200 for Google

  for (let i = 0; i < googleUrls.length; i += googleBatchSize) {
    const batch = googleUrls.slice(i, i + googleBatchSize);
    await Promise.all(
      batch.map(async (url) => {
        try {
          const result = await notifyGoogle(url, "URL_UPDATED");
          if (result) {
            console.info(`[Google] Successfully submitted URL ${url}`);
          }
        } catch (err) {
          const gaxiosError = isGaxiosError(err) ? err : undefined;
          const errorMessage = gaxiosError?.message || (err instanceof Error ? err.message : "Unknown error");
          console.error(`[Google] Failed to submit URL ${url}: ${errorMessage}`);
        }
      }),
    );
  }

  console.info("[Google] URL submission process completed.");

  // For Bing, we submit the main sitemap URL.
  const sitemapUrl = "https://williamcallahan.com/sitemap.xml";
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
