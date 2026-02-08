#!/usr/bin/env bun

/**
 * Fetch Bookmarks from Public S3 CDN
 *
 * This script fetches bookmark data from the public S3 CDN URL without requiring
 * AWS credentials. Used during Docker build to populate data for sitemap generation.
 *
 * CRITICAL: This enables sitemap generation without exposing S3 credentials in build.
 * @see https://github.com/WilliamAGH/williamcallahan.com/issues/sitemap-2024
 */

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { readJsonS3Optional } from "@/lib/s3/json";
import { z } from "zod/v4";
import { getEnvironment, getEnvironmentSuffix } from "@/lib/config/environment";
import {
  buildPaginationArtifacts,
  buildTagArtifacts,
  saveToLocalS3,
} from "./lib/bookmark-artifacts";

// Get CDN URL from environment (canonical variable)
const CDN_URL = process.env.NEXT_PUBLIC_S3_CDN_URL || "";
const ORIGIN_SERVER_URL = process.env.S3_SERVER_URL || "";
const S3_BUCKET = process.env.S3_BUCKET || "";
const resolvedEnvironment = getEnvironment();
const envSuffix = getEnvironmentSuffix();
const originBase = ORIGIN_SERVER_URL ? ORIGIN_SERVER_URL.replace(/\/+$/, "") : "";
const originBucketBase = originBase && S3_BUCKET ? `${originBase}/${S3_BUCKET}` : "";
const preferredCdnBase = CDN_URL ? CDN_URL.replace(/\/+$/, "") : originBucketBase;

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
// IMPORTANT: These must match the paths in src/lib/bookmarks/bookmarks-data-access.server.ts
// and src/lib/bookmarks/slug-manager.ts which read from generated/bookmarks/
const LOCAL_PATHS = {
  BOOKMARKS: "generated/bookmarks/bookmarks.json",
  INDEX: "generated/bookmarks/bookmarks-index.json",
  SLUG_MAPPING: "generated/bookmarks/slug-mapping.json",
};

const HAS_S3_CREDENTIALS =
  Boolean(process.env.S3_BUCKET) &&
  Boolean(process.env.S3_ACCESS_KEY_ID) &&
  Boolean(process.env.S3_SECRET_ACCESS_KEY);

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

async function fetchViaS3(key: string): Promise<unknown> {
  if (!HAS_S3_CREDENTIALS) return null;
  try {
    const data = await readJsonS3Optional<unknown>(key, z.unknown());
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

function loadExistingLocalJson(relativePath: string): unknown {
  const fullPath = join(process.cwd(), relativePath);
  try {
    const raw = readFileSync(fullPath, "utf-8");
    return JSON.parse(raw) as unknown;
  } catch (error: unknown) {
    // File not found is expected for first run; other errors are logged
    const isNotFound =
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT";
    if (isNotFound) console.info(`ℹ️  No existing local ${relativePath} snapshot found`);
    else
      console.warn(
        `⚠️  Failed to load existing ${relativePath}:`,
        error instanceof Error ? error.message : String(error),
      );
    return null;
  }
}

function getMappingCount(slugMapping: unknown): number {
  if (typeof slugMapping !== "object" || slugMapping === null) return 0;

  const mapping = slugMapping as Record<string, unknown>;

  if ("count" in mapping && typeof mapping.count === "number") {
    return mapping.count;
  }

  if ("slugs" in mapping && typeof mapping.slugs === "object" && mapping.slugs) {
    return Object.keys(mapping.slugs).length;
  }

  return 0;
}

function getLastFetchedAt(index: unknown): string | null {
  if (typeof index !== "object" || index === null || !("lastFetchedAt" in index)) {
    return null;
  }
  const lastFetchedAt = (index as Record<string, unknown>).lastFetchedAt;
  return typeof lastFetchedAt === "number" ? new Date(lastFetchedAt).toISOString() : null;
}

async function fetchWithFallback(
  path: string,
): Promise<{ data: unknown; source: "s3" | "cdn" | "local" | null }> {
  if (HAS_S3_CREDENTIALS) {
    const s3Data = await fetchViaS3(path);
    if (s3Data !== null) return { data: s3Data, source: "s3" };
  }

  const cdnData = await fetchFromCdn(path);
  if (cdnData !== null) return { data: cdnData, source: "cdn" };

  return { data: null, source: null };
}

async function fetchFromCdn(path: string): Promise<unknown> {
  const urls = buildCandidateUrls(path);
  if (urls.length === 0) {
    console.error("❌ No origin or CDN URL configured; cannot fetch", path);
    return null;
  }
  for (const url of urls) {
    const result = await fetchJson(url, path);
    if (result !== null) return result;
  }
  return null;
}

function buildCandidateUrls(path: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  const pushUrl = (value: string | undefined): void => {
    if (!value) return;
    const normalized = value.replace(/\/+$/, "");
    if (seen.has(normalized)) return;
    seen.add(normalized);
    urls.push(`${normalized}/${path}`);
  };

  pushUrl(originBucketBase);
  pushUrl(preferredCdnBase);

  return urls;
}

async function fetchSingleData(
  path: string,
  localPath: string,
  label: string,
  getCount?: (data: unknown) => string | null,
): Promise<{ data: unknown; success: boolean }> {
  const result = await fetchWithFallback(path);
  let data = result.data;

  if (!data) {
    data = loadExistingLocalJson(localPath);
    if (data) console.log(`   ♻️  Using existing local ${label} snapshot (remote fetch failed)`);
  }

  if (data) {
    saveToFile(localPath, data);
    saveToLocalS3(path, data);
    const count = getCount?.(data);
    if (count) console.log(`   ${count}`);
    return { data, success: true };
  }

  return { data: null, success: false };
}

async function fetchBookmarksData(): Promise<{
  bookmarks: unknown;
  index: unknown;
  slugMapping: unknown;
  heartbeat: unknown;
  successCount: number;
  failureCount: number;
}> {
  let successCount = 0;
  let failureCount = 0;

  const bookmarksResult = await fetchSingleData(
    BOOKMARKS_PATHS.FILE,
    LOCAL_PATHS.BOOKMARKS,
    "bookmarks",
    (data) => `📚 Loaded ${Array.isArray(data) ? data.length : 0} bookmarks`,
  );
  if (bookmarksResult.success) {
    successCount++;
  } else {
    failureCount++;
    saveToFile(LOCAL_PATHS.BOOKMARKS, []);
    saveToLocalS3(BOOKMARKS_PATHS.FILE, []);
  }

  const indexResult = await fetchSingleData(
    BOOKMARKS_PATHS.INDEX,
    LOCAL_PATHS.INDEX,
    "index",
    (data) => {
      const ts = getLastFetchedAt(data);
      return ts ? `📑 Index updated: ${ts}` : null;
    },
  );
  if (indexResult.success) {
    successCount++;
  } else {
    failureCount++;
    const fallback = { lastFetchedAt: 0 };
    saveToFile(LOCAL_PATHS.INDEX, fallback);
    saveToLocalS3(BOOKMARKS_PATHS.INDEX, fallback);
  }

  const slugResult = await fetchSingleData(
    BOOKMARKS_PATHS.SLUG_MAPPING,
    LOCAL_PATHS.SLUG_MAPPING,
    "slug-mapping",
    (data) => `🗺️  Slug mapping loaded: ${getMappingCount(data)} entries`,
  );
  if (slugResult.success) {
    successCount++;
  } else {
    failureCount++;
    const empty = { version: 1, generated: new Date().toISOString(), count: 0, slugs: {} };
    saveToFile(LOCAL_PATHS.SLUG_MAPPING, empty);
    saveToLocalS3(BOOKMARKS_PATHS.SLUG_MAPPING, empty);
  }

  const heartbeatResult = await fetchWithFallback(BOOKMARKS_PATHS.HEARTBEAT);
  if (heartbeatResult.data) {
    saveToLocalS3(BOOKMARKS_PATHS.HEARTBEAT, heartbeatResult.data);
    successCount++;
  } else {
    failureCount++;
  }

  return {
    bookmarks: bookmarksResult.data,
    index: indexResult.data,
    slugMapping: slugResult.data,
    heartbeat: heartbeatResult.data,
    successCount,
    failureCount,
  };
}

/**
 * Main execution
 */
async function main() {
  console.log("🚀 Fetching bookmark data from public S3 CDN...");
  console.log(`   CDN URL: ${CDN_URL || "(not set)"}`);
  console.log(`   Origin URL: ${ORIGIN_SERVER_URL || "(not set)"}`);
  console.log(`   Environment: ${resolvedEnvironment}`);

  const { bookmarks, index, slugMapping, successCount, failureCount } = await fetchBookmarksData();

  // Build local pagination + tag artifacts for fallback
  if (bookmarks) {
    buildPaginationArtifacts(bookmarks, slugMapping || {}, index, BOOKMARKS_PATHS.PAGE_PREFIX);
    buildTagArtifacts(
      bookmarks,
      slugMapping || {},
      BOOKMARKS_PATHS.TAG_PREFIX,
      BOOKMARKS_PATHS.TAG_INDEX_PREFIX,
    );
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
  process.exit(bookmarks ? 0 : 1);
}

// Execute main with top-level await if run directly
if (import.meta.main) {
  await main().catch((error) => {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  });
}
