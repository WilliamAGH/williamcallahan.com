#!/usr/bin/env bun

/**
 * Regenerate All JSON Files in Correct Order
 *
 * This script ensures all JSON files are regenerated in the correct dependency order
 * to maintain idempotency and prevent 404 errors.
 *
 * CRITICAL DEPENDENCY ORDER:
 * 1. Fetch bookmarks from Raindrop (generates slug mappings)
 * 2. Build content graph (uses slug mappings)
 * 3. Build search indexes (uses slug mappings)
 * 4. Generate sitemap (uses slug mappings)
 *
 * Changing this order will cause race conditions and break bookmark navigation!
 */

import { DataFetchManager } from "@/lib/server/data-fetch-manager";
import { loadSlugMapping, saveSlugMapping } from "@/lib/bookmarks/slug-manager";
import { getBookmarks } from "@/lib/bookmarks/service.server";
import { listS3Objects } from "@/lib/s3-utils";
import type { UnifiedBookmark } from "@/types/bookmark";

// Set environment to ensure we're using the data updater flow
process.env.IS_DATA_UPDATER = "true";

async function listExistingJsonFiles() {
  console.log("📋 Step 1: Checking existing JSON files...");

  try {
    // List all JSON files in the bookmarks directory
    const bookmarkFiles = await listS3Objects("json/bookmarks/");
    const searchFiles = await listS3Objects("json/search/");
    const contentGraphFiles = await listS3Objects("json/content-graph/");

    const allFiles = [...bookmarkFiles, ...searchFiles, ...contentGraphFiles];
    console.log(`   Found ${allFiles.length} existing JSON files`);
    console.log(`   Files will be overwritten during regeneration`);
  } catch (error) {
    console.error("   ❌ Error listing files:", error);
  }
}

async function fetchAndSaveBookmarks() {
  console.log("\n📚 Step 2: Fetching bookmarks and generating slug mappings...");

  const manager = new DataFetchManager();
  const result = await manager.fetchData({
    bookmarks: true,
    githubActivity: false,
    logos: false,
    searchIndexes: false,
    forceRefresh: true, // Force fresh data
  });

  const bookmarksResult = result.find((r) => r.operation === "bookmarks");
  if (!bookmarksResult?.success) {
    throw new Error("Failed to fetch bookmarks: " + bookmarksResult?.error);
  }

  console.log(`   ✅ Fetched ${bookmarksResult.itemsProcessed} bookmarks`);

  // Verify slug mappings were created; if not, generate and save now
  let slugMapping = await loadSlugMapping();
  if (!slugMapping) {
    console.warn("   ⚠️  No slug mapping found. Generating and saving now…");
    const maybeBookmarks = await getBookmarks({
      skipExternalFetch: false,
      includeImageData: false,
    });
    if (!Array.isArray(maybeBookmarks)) {
      throw new Error("CRITICAL: Invalid bookmarks payload while generating slug mappings");
    }
    await saveSlugMapping(maybeBookmarks as UnifiedBookmark[], true, false);
    slugMapping = await loadSlugMapping();
    if (!slugMapping) {
      throw new Error("CRITICAL: Failed to create slug mappings after fetch.");
    }
  }

  console.log(`   ✅ Slug mapping created with ${slugMapping.count} entries`);
  console.log(`   ✅ Checksum: ${slugMapping.checksum}`);
}

async function validateSlugMappings() {
  console.log("\n🔍 Step 3: Validating slug mappings...");

  const slugMapping = await loadSlugMapping();
  if (!slugMapping) {
    throw new Error("No slug mapping found!");
  }

  const maybeBookmarks = await getBookmarks({
    skipExternalFetch: false,
    includeImageData: false,
  });
  if (!Array.isArray(maybeBookmarks)) {
    throw new Error("Bookmarks payload is invalid");
  }
  const bookmarks = maybeBookmarks as UnifiedBookmark[];

  // Check that every bookmark has a slug
  const missingSlugIds: string[] = [];
  for (const bookmark of bookmarks) {
    if (!slugMapping.slugs[bookmark.id]) {
      missingSlugIds.push(bookmark.id);
      console.error(`   ❌ Missing slug for bookmark ${bookmark.id}: ${bookmark.title}`);
    }
  }

  if (missingSlugIds.length > 0) {
    throw new Error(`CRITICAL: ${missingSlugIds.length} bookmarks missing slugs!`);
  }

  console.log(`   ✅ All ${bookmarks.length} bookmarks have slugs`);

  // Verify idempotency - regenerate and check if same
  console.log("\n🔄 Step 4: Testing idempotency...");
  const { generateSlugMapping } = await import("@/lib/bookmarks/slug-manager");
  const newMapping = generateSlugMapping(bookmarks);

  if (newMapping.checksum === slugMapping.checksum) {
    console.log(`   ✅ Idempotency verified - checksums match`);
  } else {
    console.error(`   ❌ Idempotency FAILED - checksums differ!`);
    console.error(`      Old: ${slugMapping.checksum}`);
    console.error(`      New: ${newMapping.checksum}`);
    throw new Error("Idempotency check failed!");
  }
}

async function buildContentGraph() {
  console.log("\n🌐 Step 5: Building content graph...");

  const manager = new DataFetchManager();
  await manager.fetchData({
    bookmarks: false, // Already fetched
    githubActivity: false,
    logos: false,
    searchIndexes: false,
    forceRefresh: true,
  });

  // Content graph is built as part of bookmark fetch
  console.log(`   ✅ Content graph built`);
}

async function buildSearchIndexes() {
  console.log("\n🔍 Step 6: Building search indexes...");

  const manager = new DataFetchManager();
  const result = await manager.fetchData({
    bookmarks: false, // Already fetched
    githubActivity: false,
    logos: false,
    searchIndexes: true,
    forceRefresh: false,
  });

  const searchResult = result.find((r) => r.operation === "searchIndexes");
  if (!searchResult?.success) {
    throw new Error("Failed to build search indexes: " + searchResult?.error);
  }

  console.log(`   ✅ Built ${searchResult.itemsProcessed} search indexes`);
}

async function generateSitemap() {
  console.log("\n🗺️  Step 7: Generating sitemap...");

  try {
    // The sitemap is generated at build time or on-demand
    // We can trigger it by calling the sitemap function
    const { default: sitemap } = await import("@/app/sitemap");
    const sitemapData = await sitemap();
    console.log(`   ✅ Sitemap generated with ${sitemapData.length} entries`);
  } catch (error) {
    console.warn(`   ⚠️  Sitemap generation skipped (may require build context):`, error);
  }
}

async function main() {
  console.log("🚀 Starting complete JSON regeneration...");
  console.log("=".repeat(60));

  try {
    // Check existing files
    await listExistingJsonFiles();

    // CRITICAL: These must run in order!
    await fetchAndSaveBookmarks();
    await validateSlugMappings();
    await buildContentGraph();
    await buildSearchIndexes();
    await generateSitemap();

    console.log("\n" + "=".repeat(60));
    console.log("✅ All JSON files regenerated successfully!");
    console.log("\n📋 Summary:");
    console.log("   • Bookmarks fetched and slug mappings created");
    console.log("   • All bookmarks have valid slugs");
    console.log("   • Idempotency verified (same input = same slugs)");
    console.log("   • Content graph built with slug mappings");
    console.log("   • Search indexes built with slug mappings");
    console.log("   • System ready for deployment");
  } catch (error) {
    console.error("\n❌ CRITICAL ERROR:", error);
    console.error("\n⚠️  System is NOT ready for deployment!");
    console.error("   Fix the errors above and run this script again.");
    process.exit(1);
  }
}

// Run the script
main().catch(console.error);
