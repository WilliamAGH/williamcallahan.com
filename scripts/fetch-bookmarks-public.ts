#!/usr/bin/env bun

/**
 * Fetch Bookmarks from Public S3 CDN
 *
 * This script fetches bookmark data from the public S3 CDN URL without requiring
 * AWS credentials. Used during Docker build to populate data for sitemap generation.
 *
 * CRITICAL: This enables sitemap generation without exposing S3 credentials in build.
 * @see https://github.com/williamcallahan/williamcallahan.com/issues/sitemap-2024
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

// Get CDN URL from environment or use default
const CDN_URL = process.env.S3_CDN_URL || process.env.NEXT_PUBLIC_S3_CDN_URL || "";
const ORIGIN_SERVER_URL = process.env.S3_SERVER_URL || "";
const S3_BUCKET = process.env.S3_BUCKET || "";
const DEPLOYMENT_ENV = process.env.DEPLOYMENT_ENV || "production";

// Determine environment suffix for S3 paths
// production = no suffix, development = "-dev", test = "-test"
const envSuffix = DEPLOYMENT_ENV === "development" ? "-dev" : DEPLOYMENT_ENV === "test" ? "-test" : "";

// S3 paths to fetch
const BOOKMARKS_PATHS = {
  FILE: `json/bookmarks/bookmarks${envSuffix}.json`,
  INDEX: `json/bookmarks/index${envSuffix}.json`,
  SLUG_MAPPING: `json/bookmarks/slug-mapping${envSuffix}.json`,
};

// Local paths to save fetched data
const LOCAL_PATHS = {
  BOOKMARKS: "lib/data/bookmarks.json",
  INDEX: "lib/data/bookmarks-index.json",
  SLUG_MAPPING: "lib/data/slug-mapping.json",
};

/**
 * Fetch JSON data from public CDN URL
 */
async function fetchJson(url: string, label: string): Promise<unknown> {
  console.log(`📥 Fetching: ${url}`);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Verify we got JSON content-type (not HTML error pages)
    const contentType = response.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      // Get first 200 bytes of response for diagnostic logging
      const text = await response.text();
      const preview = text.length > 200 ? text.substring(0, 200) + "..." : text;
      console.error(`⚠️  Expected JSON but got ${contentType || "unknown"} for ${label}`);
      console.error(`   Response preview: ${preview}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error(`❌ Failed to fetch ${label}:`, error);
    return null;
  }
}

/**
 * Save JSON data to local file
 */
function saveToFile(filePath: string, data: unknown): void {
  const fullPath = join(process.cwd(), filePath);
  const dir = dirname(fullPath);

  // Ensure directory exists
  mkdirSync(dir, { recursive: true });

  // Write file
  writeFileSync(fullPath, JSON.stringify(data, null, 2));
  console.log(`✅ Saved to: ${filePath}`);
}

/**
 * Main execution
 */
async function main() {
  console.log("🚀 Fetching bookmark data from public S3 CDN...");
  console.log(`   CDN URL: ${CDN_URL}`);
  console.log(`   Origin URL: ${ORIGIN_SERVER_URL}`);
  console.log(`   Environment: ${DEPLOYMENT_ENV}`);

  let successCount = 0;
  let failureCount = 0;

  const candidateUrls = (path: string): string[] => {
    const urls: string[] = [];
    if (ORIGIN_SERVER_URL && S3_BUCKET) {
      const originBase = ORIGIN_SERVER_URL.replace(/\/+$/, "");
      urls.push(`${originBase}/${S3_BUCKET}/${path}`);
    }
    if (CDN_URL) {
      urls.push(`${CDN_URL.replace(/\/+$/, "")}/${path}`);
    }
    return urls;
  };

  const fetchWithFallback = async (path: string): Promise<unknown> => {
    const urls = candidateUrls(path);
    if (urls.length === 0) {
      console.error("❌ No origin or CDN URL configured; cannot fetch", path);
      return null;
    }
    for (const url of urls) {
      const result = await fetchJson(url, path);
      if (result) return result;
    }
    return null;
  };

  // Fetch bookmarks file
  const bookmarks = await fetchWithFallback(BOOKMARKS_PATHS.FILE);
  if (bookmarks) {
    saveToFile(LOCAL_PATHS.BOOKMARKS, bookmarks);
    successCount++;
    // Runtime check for array length instead of unsafe type assertion
    const bookmarkCount = Array.isArray(bookmarks) ? bookmarks.length : 0;
    console.log(`   📚 Loaded ${bookmarkCount} bookmarks`);
  } else {
    failureCount++;
    // Create empty file to prevent build errors
    saveToFile(LOCAL_PATHS.BOOKMARKS, []);
  }

  // Fetch index file
  const index = await fetchWithFallback(BOOKMARKS_PATHS.INDEX);
  if (index) {
    saveToFile(LOCAL_PATHS.INDEX, index);
    successCount++;
    // Runtime check for lastFetchedAt property instead of unsafe type assertion
    if (typeof index === "object" && index !== null && "lastFetchedAt" in index) {
      const lastFetchedAt = (index as Record<string, unknown>).lastFetchedAt;
      if (typeof lastFetchedAt === "number") {
        console.log(`   📑 Index updated: ${new Date(lastFetchedAt).toISOString()}`);
      }
    }
  } else {
    failureCount++;
    // Create minimal index fallback to prevent missing-file errors
    saveToFile(LOCAL_PATHS.INDEX, { lastFetchedAt: 0 });
  }

  // Fetch slug mapping (CRITICAL for sitemap generation)
  const slugMapping = await fetchWithFallback(BOOKMARKS_PATHS.SLUG_MAPPING);
  if (slugMapping) {
    saveToFile(LOCAL_PATHS.SLUG_MAPPING, slugMapping);
    successCount++;
    // Runtime check for count property instead of unsafe type assertion
    let mappingCount = 0;
    if (typeof slugMapping === "object" && slugMapping !== null) {
      // Check for 'count' property
      if ("count" in slugMapping && typeof (slugMapping as Record<string, unknown>).count === "number") {
        mappingCount = (slugMapping as Record<string, unknown>).count as number;
      }
      // Fallback: count the 'slugs' object keys if present
      else if ("slugs" in slugMapping && typeof (slugMapping as Record<string, unknown>).slugs === "object") {
        const slugs = (slugMapping as Record<string, unknown>).slugs;
        if (slugs && typeof slugs === "object") {
          mappingCount = Object.keys(slugs).length;
        }
      }
    }
    console.log(`   🗺️  Slug mapping loaded: ${mappingCount} entries`);
  } else {
    failureCount++;
    // Create minimal slug mapping to prevent errors
    saveToFile(LOCAL_PATHS.SLUG_MAPPING, {
      version: 1,
      generated: new Date().toISOString(),
      count: 0,
      slugs: {},
    });
  }

  // Summary
  console.log("\n📊 Summary:");
  console.log(`   ✅ Success: ${successCount}/3 files`);
  if (failureCount > 0) {
    console.log(`   ⚠️  Failed: ${failureCount}/3 files`);
    console.log(`   Note: Sitemap may be incomplete without bookmark data`);
  }

  // Exit with appropriate code
  process.exit(failureCount > 0 ? 1 : 0);
}

// Run if executed directly
if (import.meta.main) {
  main().catch(error => {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  });
}
