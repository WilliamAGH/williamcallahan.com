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
const DEPLOYMENT_ENV = process.env.DEPLOYMENT_ENV || "production";

if (!CDN_URL) {
  console.error("❌ No CDN URL configured. Set S3_CDN_URL or NEXT_PUBLIC_S3_CDN_URL");
  process.exit(1);
}

// Determine environment suffix for S3 paths
const envSuffix = DEPLOYMENT_ENV === "development" ? "-dev" : "";

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
async function fetchFromCDN(path: string): Promise<unknown> {
  const url = `${CDN_URL.replace(/\/+$/, "")}/${path}`;
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
      console.error(`⚠️  Expected JSON but got ${contentType || "unknown"} for ${path}`);
      console.error(`   Response preview: ${preview}`);
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error(`❌ Failed to fetch ${path}:`, error);
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
  console.log(`   Environment: ${DEPLOYMENT_ENV}`);
  
  let successCount = 0;
  let failureCount = 0;
  
  // Fetch bookmarks file
  const bookmarks = await fetchFromCDN(BOOKMARKS_PATHS.FILE);
  if (bookmarks) {
    saveToFile(LOCAL_PATHS.BOOKMARKS, bookmarks);
    successCount++;
    const bookmarkArray = bookmarks as { length?: number };
    console.log(`   📚 Loaded ${bookmarkArray.length || 0} bookmarks`);
  } else {
    failureCount++;
    // Create empty file to prevent build errors
    saveToFile(LOCAL_PATHS.BOOKMARKS, []);
  }
  
  // Fetch index file
  const index = await fetchFromCDN(BOOKMARKS_PATHS.INDEX);
  if (index) {
    saveToFile(LOCAL_PATHS.INDEX, index);
    successCount++;
    const indexData = index as { lastFetchedAt?: number };
    if (indexData.lastFetchedAt) {
      console.log(`   📑 Index updated: ${new Date(indexData.lastFetchedAt).toISOString()}`);
    }
  } else {
    failureCount++;
  }
  
  // Fetch slug mapping (CRITICAL for sitemap generation)
  const slugMapping = await fetchFromCDN(BOOKMARKS_PATHS.SLUG_MAPPING);
  if (slugMapping) {
    saveToFile(LOCAL_PATHS.SLUG_MAPPING, slugMapping);
    successCount++;
    const mappingData = slugMapping as { count?: number };
    console.log(`   🗺️  Slug mapping loaded: ${mappingData.count || 0} entries`);
  } else {
    failureCount++;
    // Create minimal slug mapping to prevent errors
    saveToFile(LOCAL_PATHS.SLUG_MAPPING, {
      version: 1,
      generatedAt: new Date().toISOString(),
      count: 0,
      mappings: {},
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
  main().catch((error) => {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  });
}