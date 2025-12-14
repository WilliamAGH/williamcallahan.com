#!/usr/bin/env bun

/**
 * Comprehensive S3 Path Audit Script
 *
 * Verifies all S3 paths are accessible and consistent after content graph changes
 */

import { readJsonS3, listS3Objects, getS3Client } from "../src/lib/s3-utils";
import {
  BOOKMARKS_S3_PATHS,
  IMAGE_S3_PATHS,
  SEARCH_S3_PATHS,
  IMAGE_MANIFEST_S3_PATHS,
  GITHUB_ACTIVITY_S3_PATHS,
  OPENGRAPH_JSON_S3_PATHS,
  CONTENT_GRAPH_S3_PATHS,
} from "../src/lib/constants";
import type { PathCheck } from "@/types/utils/audit";
import type { BookmarkSlugMapping } from "@/types/bookmark";
import type { BookmarksIndexEntry, ContentGraphMetadata, RelatedContentEntry } from "@/types/related-content";
import { ServerCacheInstance } from "../src/lib/server-cache";
import { getMemoryHealthMonitor } from "../src/lib/health/memory-health-monitor";

async function checkPath(path: string): Promise<PathCheck> {
  try {
    const data = await readJsonS3(path);
    const itemCount = Array.isArray(data)
      ? data.length
      : data && typeof data === "object"
        ? Object.keys(data).length
        : undefined;
    return { path, exists: !!data, itemCount };
  } catch (error) {
    return { path, exists: false, error: String(error) };
  }
}

async function checkDirectory(dir: string): Promise<PathCheck> {
  try {
    const items = await listS3Objects(dir);
    return { path: dir, exists: true, itemCount: items.length };
  } catch (error) {
    return { path: dir, exists: false, error: String(error) };
  }
}

async function auditS3Paths() {
  console.log("🔍 S3 Path Integrity Audit\n");
  console.log("=".repeat(80));

  const results: Record<string, PathCheck[]> = {};

  // 1. Check Bookmarks Paths
  console.log("\n📚 BOOKMARKS PATHS:");
  results.bookmarks = await Promise.all([
    checkPath(BOOKMARKS_S3_PATHS.FILE),
    checkPath(BOOKMARKS_S3_PATHS.INDEX),
    checkPath(BOOKMARKS_S3_PATHS.HEARTBEAT),
    checkPath(`${BOOKMARKS_S3_PATHS.PAGE_PREFIX}1.json`),
    checkPath(`${BOOKMARKS_S3_PATHS.PAGE_PREFIX}2.json`),
    checkPath(BOOKMARKS_S3_PATHS.SLUG_MAPPING),
  ]);

  // 2. Check Content Graph Paths (NEW)
  console.log("\n🕸️ CONTENT GRAPH PATHS:");
  results.contentGraph = await Promise.all([
    checkPath(CONTENT_GRAPH_S3_PATHS.RELATED_CONTENT),
    checkPath(CONTENT_GRAPH_S3_PATHS.TAG_GRAPH),
    checkPath(CONTENT_GRAPH_S3_PATHS.METADATA),
  ]);

  // 3. Check Search Index Paths
  console.log("\n🔎 SEARCH INDEX PATHS:");
  results.search = await Promise.all([
    checkPath(SEARCH_S3_PATHS.POSTS_INDEX),
    checkPath(SEARCH_S3_PATHS.BOOKMARKS_INDEX),
    checkPath(SEARCH_S3_PATHS.INVESTMENTS_INDEX),
    checkPath(SEARCH_S3_PATHS.EXPERIENCE_INDEX),
    checkPath(SEARCH_S3_PATHS.EDUCATION_INDEX),
    checkPath(SEARCH_S3_PATHS.BUILD_METADATA),
  ]);

  // 4. Check Image Directories
  console.log("\n🖼️ IMAGE DIRECTORIES:");
  results.images = await Promise.all([
    checkDirectory(IMAGE_S3_PATHS.LOGOS_DIR),
    checkDirectory(IMAGE_S3_PATHS.OPENGRAPH_DIR),
    checkDirectory(IMAGE_S3_PATHS.BLOG_DIR),
  ]);

  // 5. Check Image Manifests
  console.log("\n📋 IMAGE MANIFESTS:");
  results.manifests = await Promise.all([
    checkPath(IMAGE_MANIFEST_S3_PATHS.LOGOS_MANIFEST),
    checkPath(IMAGE_MANIFEST_S3_PATHS.OPENGRAPH_MANIFEST),
    checkPath(IMAGE_MANIFEST_S3_PATHS.BLOG_IMAGES_MANIFEST),
  ]);

  // 6. Check OpenGraph JSON Paths
  console.log("\n🌐 OPENGRAPH DATA:");
  results.opengraph = await Promise.all([
    checkDirectory(OPENGRAPH_JSON_S3_PATHS.DIR),
    checkDirectory(`${OPENGRAPH_JSON_S3_PATHS.DIR}/metadata`),
  ]);

  // 7. Check GitHub Activity
  console.log("\n📊 GITHUB ACTIVITY:");
  results.github = await Promise.all([
    checkPath(GITHUB_ACTIVITY_S3_PATHS.ACTIVITY_DATA),
    checkPath(GITHUB_ACTIVITY_S3_PATHS.STATS_SUMMARY),
    checkPath(GITHUB_ACTIVITY_S3_PATHS.ALL_TIME_SUMMARY),
  ]);

  // Print Results
  console.log("\n" + "=".repeat(80));
  console.log("📊 AUDIT RESULTS:\n");

  let totalChecks = 0;
  let passedChecks = 0;

  for (const [category, checks] of Object.entries(results)) {
    console.log(`\n${category.toUpperCase()}:`);
    for (const check of checks) {
      totalChecks++;
      const status = check.exists ? "✅" : "❌";
      if (check.exists) passedChecks++;

      const itemInfo = check.itemCount !== undefined ? ` (${check.itemCount} items)` : "";
      console.log(`  ${status} ${check.path}${itemInfo}`);

      if (check.error && !check.exists) {
        // Only show error for missing files, not for 404s which are expected
        if (!check.error.includes("404")) {
          console.log(`     ⚠️ Error: ${check.error.substring(0, 100)}`);
        }
      }
    }
  }

  // Summary
  console.log("\n" + "=".repeat(80));
  console.log(`\n📈 SUMMARY: ${passedChecks}/${totalChecks} paths verified`);

  if (passedChecks === totalChecks) {
    console.log("✅ All S3 paths are accessible and working correctly!");
  } else {
    console.log(`⚠️ ${totalChecks - passedChecks} paths could not be verified`);
    console.log("\nMissing paths may be expected if:");
    console.log("- This is a fresh environment");
    console.log("- Data hasn't been fetched yet");
    console.log("- You're in development mode");
  }

  // Check pagination consistency
  console.log("\n" + "=".repeat(80));
  console.log("\n🔄 PAGINATION CONSISTENCY CHECK:");

  try {
    const index = await readJsonS3<BookmarksIndexEntry>(BOOKMARKS_S3_PATHS.INDEX);
    if (index?.totalPages) {
      console.log(`  📖 Index reports ${index.totalPages} pages`);

      // Check if all pages exist
      let pagesFound = 0;
      for (let i = 1; i <= index.totalPages; i++) {
        const pagePath = `${BOOKMARKS_S3_PATHS.PAGE_PREFIX}${i}.json`;
        try {
          const pageData = await readJsonS3(pagePath);
          if (pageData) pagesFound++;
        } catch {
          console.log(`  ⚠️ Missing page ${i}`);
        }
      }

      if (pagesFound === index.totalPages) {
        console.log(`  ✅ All ${pagesFound} pages verified`);
      } else {
        console.log(`  ❌ Only ${pagesFound}/${index.totalPages} pages found`);
      }
    }
  } catch {
    console.log("  ⚠️ Could not verify pagination");
  }

  // Check slug mapping
  console.log("\n🔗 SLUG MAPPING CHECK:");
  try {
    const slugMapping = await readJsonS3<BookmarkSlugMapping>(BOOKMARKS_S3_PATHS.SLUG_MAPPING);
    if (slugMapping) {
      const slugCount = Object.keys(slugMapping.slugs || {}).length;
      const reverseCount = Object.keys(slugMapping.reverseMap || {}).length;
      console.log(`  ✅ Slug mapping found: ${slugCount} slugs, ${reverseCount} reverse mappings`);

      if (slugCount !== reverseCount) {
        console.log(`  ⚠️ Mismatch: ${slugCount} slugs vs ${reverseCount} reverse mappings`);
      }
    } else {
      console.log("  ❌ No slug mapping found");
    }
  } catch {
    console.log("  ❌ Could not read slug mapping");
  }

  // Check content graph integrity
  console.log("\n🕸️ CONTENT GRAPH INTEGRITY:");
  try {
    const relatedContent = await readJsonS3<Record<string, RelatedContentEntry[]>>(
      CONTENT_GRAPH_S3_PATHS.RELATED_CONTENT,
    );
    const metadata = await readJsonS3<ContentGraphMetadata>(CONTENT_GRAPH_S3_PATHS.METADATA);

    if (relatedContent && metadata) {
      const relatedCount = Object.keys(relatedContent).length;
      const expectedTotal = metadata.counts?.total || 0;

      console.log(`  📊 Related content: ${relatedCount} items`);
      console.log(`  📊 Metadata reports: ${expectedTotal} total items`);

      if (relatedCount === expectedTotal) {
        console.log(`  ✅ Content graph counts match`);
      } else {
        console.log(`  ⚠️ Count mismatch: ${relatedCount} vs ${expectedTotal}`);
      }

      // Check sample relationships
      const sampleKey = Object.keys(relatedContent)[0];
      if (sampleKey) {
        const relations = relatedContent[sampleKey];
        console.log(`  🔗 Sample (${sampleKey}): ${relations?.length ?? 0} related items`);
      }
    } else {
      console.log("  ❌ Content graph not fully populated");
    }
  } catch {
    console.log("  ❌ Could not verify content graph");
  }
}

// Run the audit
auditS3Paths()
  .catch(err => {
    console.error(err);
  })
  .finally(() => {
    // Ensure S3 client sockets are closed to avoid any lingering keep-alive handles
    const client = getS3Client();
    if (client && typeof client.destroy === "function") {
      client.destroy();
    }

    // Tear down process-wide intervals/singletons created via imports
    try {
      ServerCacheInstance.destroy();
    } catch {
      // Ignore cleanup errors
    }
    try {
      const monitor = getMemoryHealthMonitor();
      monitor.destroy();
    } catch {
      // Ignore cleanup errors
    }
  });
