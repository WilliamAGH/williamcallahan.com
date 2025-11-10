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
import { normalizeTagsToStrings, tagToSlug } from "../lib/utils/tag-utils";
import { calculateBookmarksChecksum } from "../lib/bookmarks/utils";
import { readJsonS3 } from "../lib/s3-utils";

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
  HEARTBEAT: `json/bookmarks/heartbeat${envSuffix}.json`,
  PAGE_PREFIX: `json/bookmarks/pages${envSuffix}/page-`,
  TAG_PREFIX: `json/bookmarks/tags${envSuffix}/`,
  TAG_INDEX_PREFIX: `json/bookmarks/tags${envSuffix}/`,
};

// Local paths to save fetched data
const LOCAL_PATHS = {
  BOOKMARKS: "lib/data/bookmarks.json",
  INDEX: "lib/data/bookmarks-index.json",
  SLUG_MAPPING: "lib/data/slug-mapping.json",
};

const LOCAL_S3_BASE = join(process.cwd(), "lib/data/s3-cache");
const HAS_S3_CREDENTIALS =
  Boolean(process.env.S3_BUCKET) && Boolean(process.env.S3_ACCESS_KEY_ID) && Boolean(process.env.S3_SECRET_ACCESS_KEY);

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

async function fetchViaS3(key: string): Promise<unknown | null> {
  if (!HAS_S3_CREDENTIALS) return null;
  try {
    const data = await readJsonS3<unknown>(key);
    if (data !== null) {
      console.log(`   📡 Loaded ${key} via S3 SDK`);
    }
    return data;
  } catch (error) {
    console.error(`⚠️  Failed to fetch ${key} via S3 SDK:`, error);
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

function saveToLocalS3(key: string, data: unknown): void {
  const fullPath = join(LOCAL_S3_BASE, key);
  const dir = dirname(fullPath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, JSON.stringify(data, null, 2));
  console.log(`   📦 Cached ${key} locally (${fullPath})`);
}

type BookmarkRecord = Record<string, unknown> & { id?: string; slug?: string; tags?: unknown };

function embedSlug(bookmark: BookmarkRecord, slugMapping: any): BookmarkRecord {
  if (bookmark.slug) return bookmark;
  const slug = slugMapping?.slugs?.[bookmark.id as string]?.slug;
  return slug ? { ...bookmark, slug } : bookmark;
}

function buildPaginationArtifacts(rawBookmarks: unknown, slugMapping: any, index: any, pagePrefix: string): void {
  if (!Array.isArray(rawBookmarks) || rawBookmarks.length === 0) return;
  const pageSize = typeof index?.pageSize === "number" && index.pageSize > 0 ? index.pageSize : 24;
  const bookmarks = rawBookmarks.map(b => embedSlug(b as BookmarkRecord, slugMapping));
  const totalPages = Math.max(1, Math.ceil(bookmarks.length / pageSize));
  for (let page = 1; page <= totalPages; page++) {
    const start = (page - 1) * pageSize;
    const slice = bookmarks.slice(start, start + pageSize);
    saveToLocalS3(`${pagePrefix}${page}.json`, slice);
  }
}

function buildTagArtifacts(rawBookmarks: unknown, slugMapping: any, tagPrefix: string, tagIndexPrefix: string): void {
  if (!Array.isArray(rawBookmarks) || rawBookmarks.length === 0) return;
  const tagBuckets = new Map<string, BookmarkRecord[]>();
  rawBookmarks.forEach(item => {
    const bookmark = embedSlug(item as BookmarkRecord, slugMapping);
    const tagNames = normalizeTagsToStrings((bookmark.tags as Array<string>) || []);
    tagNames.forEach(tagName => {
      const slug = tagToSlug(tagName);
      if (!slug) return;
      if (!tagBuckets.has(slug)) tagBuckets.set(slug, []);
      tagBuckets.get(slug)?.push(bookmark);
    });
  });

  const pageSize = 24;
  const timestamp = Date.now();
  tagBuckets.forEach((bookmarks, slug) => {
    const totalPages = Math.max(1, Math.ceil(bookmarks.length / pageSize));
    const indexPayload = {
      count: bookmarks.length,
      totalPages,
      pageSize,
      lastModified: new Date().toISOString(),
      lastFetchedAt: timestamp,
      lastAttemptedAt: timestamp,
      checksum: calculateBookmarksChecksum(bookmarks as any),
      changeDetected: true,
    };
    saveToLocalS3(`${tagIndexPrefix}${slug}/index.json`, indexPayload);
    for (let page = 1; page <= totalPages; page++) {
      const start = (page - 1) * pageSize;
      const slice = bookmarks.slice(start, start + pageSize);
      saveToLocalS3(`${tagPrefix}${slug}/page-${page}.json`, slice);
    }
  });
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
      if (result !== null) return result;
    }
    return null;
  };

  // Fetch bookmarks file
  const bookmarks =
    (HAS_S3_CREDENTIALS ? await fetchViaS3(BOOKMARKS_PATHS.FILE) : null) ??
    (await fetchWithFallback(BOOKMARKS_PATHS.FILE));
  if (bookmarks) {
    saveToFile(LOCAL_PATHS.BOOKMARKS, bookmarks);
    saveToLocalS3(BOOKMARKS_PATHS.FILE, bookmarks);
    successCount++;
    // Runtime check for array length instead of unsafe type assertion
    const bookmarkCount = Array.isArray(bookmarks) ? bookmarks.length : 0;
    console.log(`   📚 Loaded ${bookmarkCount} bookmarks`);
  } else {
    failureCount++;
    // Create empty file to prevent build errors
    saveToFile(LOCAL_PATHS.BOOKMARKS, []);
    saveToLocalS3(BOOKMARKS_PATHS.FILE, []);
  }

  // Fetch index file
  const index =
    (HAS_S3_CREDENTIALS ? await fetchViaS3(BOOKMARKS_PATHS.INDEX) : null) ??
    (await fetchWithFallback(BOOKMARKS_PATHS.INDEX));
  if (index) {
    saveToFile(LOCAL_PATHS.INDEX, index);
    saveToLocalS3(BOOKMARKS_PATHS.INDEX, index);
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
    const fallbackIndex = { lastFetchedAt: 0 };
    saveToFile(LOCAL_PATHS.INDEX, fallbackIndex);
    saveToLocalS3(BOOKMARKS_PATHS.INDEX, fallbackIndex);
  }

  // Fetch slug mapping (CRITICAL for sitemap generation)
  const slugMapping =
    (HAS_S3_CREDENTIALS ? await fetchViaS3(BOOKMARKS_PATHS.SLUG_MAPPING) : null) ??
    (await fetchWithFallback(BOOKMARKS_PATHS.SLUG_MAPPING));
  if (slugMapping) {
    saveToFile(LOCAL_PATHS.SLUG_MAPPING, slugMapping);
    saveToLocalS3(BOOKMARKS_PATHS.SLUG_MAPPING, slugMapping);
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
    const emptyMapping = {
      version: 1,
      generated: new Date().toISOString(),
      count: 0,
      slugs: {},
    };
    saveToFile(LOCAL_PATHS.SLUG_MAPPING, emptyMapping);
    saveToLocalS3(BOOKMARKS_PATHS.SLUG_MAPPING, emptyMapping);
  }

  // Fetch heartbeat file
  const heartbeat =
    (HAS_S3_CREDENTIALS ? await fetchViaS3(BOOKMARKS_PATHS.HEARTBEAT) : null) ??
    (await fetchWithFallback(BOOKMARKS_PATHS.HEARTBEAT));
  if (heartbeat) {
    saveToLocalS3(BOOKMARKS_PATHS.HEARTBEAT, heartbeat);
    successCount++;
  } else {
    failureCount++;
  }

  // Build local pagination + tag artifacts for fallback
  if (bookmarks) {
    buildPaginationArtifacts(bookmarks, slugMapping || {}, index, BOOKMARKS_PATHS.PAGE_PREFIX);
    buildTagArtifacts(bookmarks, slugMapping || {}, BOOKMARKS_PATHS.TAG_PREFIX, BOOKMARKS_PATHS.TAG_INDEX_PREFIX);
  }

  // Summary
  const totalOps = successCount + failureCount;
  console.log("\n📊 Summary:");
  console.log(`   ✅ Success: ${successCount}/${totalOps} fetch/build steps`);
  if (failureCount > 0) {
    console.log(`   ⚠️  Failed: ${failureCount}/${totalOps} steps`);
    console.log(`   Note: Build will proceed using any locally cached data.`);
  }

  // Only fail hard if we couldn't fetch bookmarks at all
  const criticalFailure = !bookmarks;
  process.exit(criticalFailure ? 1 : 0);
}

// Run if executed directly
if (import.meta.main) {
  main().catch(error => {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  });
}
