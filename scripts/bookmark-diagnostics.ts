#!/usr/bin/env bun

/**
 * Consolidated Bookmark Diagnostics Tool
 *
 * This script provides comprehensive diagnostics for bookmark data integrity,
 * combining functionality from multiple diagnostic scripts into one utility.
 *
 * Usage:
 *   bun run scripts/bookmark-diagnostics.ts [command]
 *
 * Commands:
 *   counts     - Check bookmark counts and pagination (default)
 *   integrity  - Full integrity audit including slugs and routing
 *   structure  - Analyze bookmark data structure and fields
 *   prod       - Check production bookmarks specifically
 *   all        - Run all diagnostics
 */

import { readJsonS3 } from "@/lib/s3-utils";
import { BOOKMARKS_S3_PATHS } from "@/lib/constants";
import type { UnifiedBookmark } from "@/types";
import { bookmarkSlugMappingSchema, type BookmarksIndex } from "@/types/bookmark";
import { loadSlugMapping, getSlugForBookmark, getBookmarkIdFromSlug } from "@/lib/bookmarks/slug-manager";

// Command line argument parsing
const command = process.argv[2] || "counts";
const validCommands = ["counts", "integrity", "structure", "prod", "all"];

if (!validCommands.includes(command)) {
  console.error(`Invalid command: ${command}`);
  console.error(`Valid commands: ${validCommands.join(", ")}`);
  process.exit(1);
}

// Diagnostic functions

async function checkBookmarkCounts() {
  console.log("\n📊 BOOKMARK COUNT ANALYSIS");
  console.log("─".repeat(40));

  try {
    const bookmarks = await readJsonS3<UnifiedBookmark[]>(BOOKMARKS_S3_PATHS.FILE);
    const index = await readJsonS3<BookmarksIndex>(BOOKMARKS_S3_PATHS.INDEX);

    console.log(`Actual bookmarks count: ${bookmarks?.length || 0}`);
    console.log(`Index count: ${index?.count || 0}`);
    console.log(`Match: ${bookmarks?.length === index?.count ? "✅ YES" : "❌ NO"}`);

    if (bookmarks?.length !== index?.count) {
      console.log(`\n⚠️  MISMATCH DETECTED!`);
      console.log(`Difference: ${(index?.count || 0) - (bookmarks?.length || 0)}`);
    }

    // Check pagination
    if (index?.totalPages && bookmarks?.length) {
      const expectedPages = Math.ceil(bookmarks.length / (index.pageSize || 24));
      console.log(`\n📄 Pagination:`);
      console.log(`Expected pages: ${expectedPages}`);
      console.log(`Index pages: ${index.totalPages}`);
      console.log(`Pages match: ${expectedPages === index.totalPages ? "✅ YES" : "❌ NO"}`);
    }

    // Check for duplicates
    if (bookmarks && bookmarks.length > 0) {
      const ids = bookmarks.map(b => b.id);
      const uniqueIds = new Set(ids);
      console.log(`\n🔍 Duplicate Check:`);
      console.log(`Total IDs: ${ids.length}`);
      console.log(`Unique IDs: ${uniqueIds.size}`);
      console.log(`Duplicates: ${ids.length - uniqueIds.size}`);
    }

    return true;
  } catch (error) {
    console.error("Error reading S3 data:", error);
    return false;
  }
}

async function checkBookmarkIntegrity() {
  console.log("\n🔍 COMPREHENSIVE INTEGRITY AUDIT");
  console.log("─".repeat(40));

  const results: Array<{
    category: string;
    status: "✅" | "❌" | "⚠️";
    message: string;
    details?: string[];
  }> = [];

  try {
    // Check slug mapping
    console.log("\n📋 Slug Mapping Verification:");
    const slugMapping = await loadSlugMapping();

    if (!slugMapping) {
      results.push({
        category: "Slug Mapping",
        status: "❌",
        message: "No slug mapping found - bookmarks will 404!",
      });
      return false;
    }

    const validation = bookmarkSlugMappingSchema.safeParse(slugMapping);
    if (!validation.success) {
      results.push({
        category: "Slug Mapping",
        status: "❌",
        message: "Invalid slug mapping schema",
        details: validation.error.issues.map(i => i.message),
      });
      return false;
    }

    results.push({
      category: "Slug Mapping",
      status: "✅",
      message: `${slugMapping.count} slugs mapped successfully`,
    });

    // Check bookmarks have slugs
    console.log("\n🔗 Checking bookmark slugs:");
    const bookmarks = await readJsonS3<UnifiedBookmark[]>(BOOKMARKS_S3_PATHS.FILE);

    if (!bookmarks || bookmarks.length === 0) {
      results.push({
        category: "Bookmarks",
        status: "❌",
        message: "No bookmarks found",
      });
      return false;
    }

    const missingSlugs: Array<{ id: string; title: string; url: string }> = [];
    const invalidSlugs: Array<{ id: string; title: string; url: string; slug: string }> = [];

    for (const bookmark of bookmarks) {
      const slug = getSlugForBookmark(slugMapping, bookmark.id);
      if (!slug) {
        missingSlugs.push({
          id: bookmark.id,
          title: bookmark.title || "Untitled",
          url: bookmark.url,
        });
      } else {
        const reverseId = getBookmarkIdFromSlug(slugMapping, slug);
        if (reverseId !== bookmark.id) {
          invalidSlugs.push({
            id: bookmark.id,
            title: bookmark.title || "Untitled",
            url: bookmark.url,
            slug,
          });
        }
      }
    }

    if (missingSlugs.length > 0) {
      results.push({
        category: "Bookmark Slugs",
        status: "❌",
        message: `${missingSlugs.length} bookmarks missing slugs - will cause 404s!`,
        details: missingSlugs.map(b => `ID: ${b.id} | Title: "${b.title}" | URL: ${b.url}`),
      });
    } else if (invalidSlugs.length > 0) {
      results.push({
        category: "Bookmark Slugs",
        status: "⚠️",
        message: `${invalidSlugs.length} bookmarks have invalid slug mappings`,
        details: invalidSlugs.map(b => `ID: ${b.id} | Slug: "${b.slug}" | Title: "${b.title}"`),
      });
    } else {
      results.push({
        category: "Bookmark Slugs",
        status: "✅",
        message: "All bookmarks have valid slugs",
      });
    }

    // Check pagination files
    console.log("\n📑 Checking pagination files:");
    const index = await readJsonS3<BookmarksIndex>(BOOKMARKS_S3_PATHS.INDEX);

    if (index?.totalPages) {
      for (let i = 1; i <= Math.min(3, index.totalPages); i++) {
        const pagePath = `${BOOKMARKS_S3_PATHS.PAGE_PREFIX}${i}.json`;
        const pageData = await readJsonS3<UnifiedBookmark[]>(pagePath);

        if (!pageData) {
          results.push({
            category: `Page ${i}`,
            status: "❌",
            message: `Page file missing`,
          });
        } else {
          const pageBookmarksWithoutSlugs = pageData.filter(b => !b.slug);
          if (pageBookmarksWithoutSlugs.length > 0) {
            results.push({
              category: `Page ${i}`,
              status: "⚠️",
              message: `${pageBookmarksWithoutSlugs.length} items missing embedded slugs`,
            });
          } else {
            results.push({
              category: `Page ${i}`,
              status: "✅",
              message: `${pageData.length} items with valid slugs`,
            });
          }
        }
      }
    }

    // Print results summary
    console.log("\n📊 AUDIT SUMMARY:");
    console.log("─".repeat(40));

    for (const result of results) {
      console.log(`${result.status} ${result.category}: ${result.message}`);
      if (result.details) {
        result.details.forEach(d => console.log(`   - ${d}`));
      }
    }

    const hasErrors = results.some(r => r.status === "❌");
    const hasWarnings = results.some(r => r.status === "⚠️");

    if (hasErrors) {
      console.log("\n❌ CRITICAL ISSUES FOUND - Fix immediately to prevent 404s!");

      // Display critical issues with bookmark details
      const criticalIssues = results.filter(r => r.status === "❌" && r.details);
      if (criticalIssues.length > 0) {
        console.log("\n🚨 BOOKMARKS REQUIRING IMMEDIATE ATTENTION:");
        console.log("─".repeat(60));
        criticalIssues.forEach(issue => {
          console.log(`\n${issue.category}:`);
          issue.details?.forEach(detail => {
            console.log(`  • ${detail}`);
          });
        });
        console.log("\n" + "─".repeat(60));
        console.log("Fix these bookmarks by running the slug generation script");
        console.log("or manually adding them to the slug mapping.");
      }

      return false;
    } else if (hasWarnings) {
      console.log("\n⚠️  Warnings found - Review and fix if needed");

      // Display warnings with details
      const warningIssues = results.filter(r => r.status === "⚠️" && r.details);
      if (warningIssues.length > 0) {
        console.log("\n⚠️  BOOKMARKS WITH WARNINGS:");
        console.log("─".repeat(60));
        warningIssues.forEach(issue => {
          console.log(`\n${issue.category}:`);
          issue.details?.forEach(detail => {
            console.log(`  • ${detail}`);
          });
        });
      }

      return true;
    } else {
      console.log("\n✅ All integrity checks passed!");
      return true;
    }
  } catch (error) {
    console.error("Error during integrity check:", error);
    return false;
  }
}

async function checkBookmarkStructure() {
  console.log("\n🏗️ BOOKMARK STRUCTURE ANALYSIS");
  console.log("─".repeat(40));

  try {
    const bookmarks = await readJsonS3<UnifiedBookmark[]>(BOOKMARKS_S3_PATHS.FILE);

    if (!bookmarks || !Array.isArray(bookmarks) || bookmarks.length === 0) {
      console.log("❌ No bookmarks found");
      return false;
    }

    console.log(`Found ${bookmarks.length} bookmarks\n`);

    // Analyze first bookmark structure
    console.log("FIRST BOOKMARK STRUCTURE:");
    const first = bookmarks[0];
    console.log(JSON.stringify(first, null, 2).split("\n").slice(0, 20).join("\n"));
    console.log("...\n");

    // Analyze field presence
    console.log("FIELD PRESENCE ANALYSIS:");
    const fieldPresence: Record<string, number> = {};
    const fieldTypes: Record<string, Set<string>> = {};

    bookmarks.forEach(b => {
      Object.keys(b).forEach(key => {
        if (!fieldPresence[key]) fieldPresence[key] = 0;
        fieldPresence[key]++;

        if (!fieldTypes[key]) fieldTypes[key] = new Set();
        const value = (b as Record<string, unknown>)[key];
        fieldTypes[key].add(value === null ? "null" : typeof value);
      });
    });

    // Sort by presence
    const sortedFields = Object.entries(fieldPresence)
      .toSorted(([, a], [, b]) => b - a)
      .map(([field, count]) => ({
        field,
        count,
        percentage: ((count / bookmarks.length) * 100).toFixed(1),
        types: fieldTypes[field] ? Array.from(fieldTypes[field]).join(", ") : "unknown",
      }));

    console.log("Field | Present In | Types");
    console.log("------|------------|-------");
    sortedFields.forEach(({ field, percentage, types }) => {
      console.log(`${field.padEnd(20)} | ${percentage}% | ${types}`);
    });

    // Check for critical fields
    console.log("\n🔐 CRITICAL FIELDS CHECK:");
    const criticalFields = ["id", "url", "title", "slug"];
    criticalFields.forEach(field => {
      const presence = fieldPresence[field] || 0;
      const percentage = ((presence / bookmarks.length) * 100).toFixed(1);
      const status = presence === bookmarks.length ? "✅" : presence > bookmarks.length * 0.9 ? "⚠️" : "❌";
      console.log(`${status} ${field}: ${percentage}%`);
    });

    // Check for date fields
    console.log("\n📅 DATE FIELDS:");
    const dateFields = Object.keys(fieldPresence).filter(
      k =>
        k.toLowerCase().includes("date") ||
        k.toLowerCase().includes("created") ||
        k.toLowerCase().includes("updated") ||
        k.toLowerCase().includes("time"),
    );

    if (dateFields.length > 0) {
      dateFields.forEach(field => {
        const count = fieldPresence[field] ?? 0;
        const percentage = ((count / bookmarks.length) * 100).toFixed(1);
        console.log(`${field}: ${percentage}%`);

        // Show sample values
        const samples = bookmarks
          .filter(b => Boolean((b as Record<string, unknown>)[field]))
          .slice(0, 2)
          .map(b => (b as Record<string, unknown>)[field]);
        if (samples.length > 0) {
          console.log(`  Sample: ${samples[0]}`);
        }
      });
    } else {
      console.log("No date fields found");
    }

    return true;
  } catch (error) {
    console.error("Error analyzing structure:", error);
    return false;
  }
}

async function checkProductionBookmarks() {
  console.log("\n🚀 PRODUCTION BOOKMARKS CHECK");
  console.log("─".repeat(40));

  try {
    // S3 utilities automatically handle environment-based paths
    const bookmarks = await readJsonS3<UnifiedBookmark[]>(BOOKMARKS_S3_PATHS.FILE);
    const index = await readJsonS3<BookmarksIndex>(BOOKMARKS_S3_PATHS.INDEX);

    if (!bookmarks) {
      console.log("❌ No production bookmarks found");
      return false;
    }

    console.log(`Production bookmarks: ${bookmarks.length}`);
    console.log(`Production index count: ${index?.count || 0}`);
    console.log(`Match: ${bookmarks.length === index?.count ? "✅" : "❌"}`);

    // Check for test data in production
    const testBookmarks = bookmarks.filter(
      b => b.id.includes("test") || b.url.includes("example.com") || b.title?.toLowerCase().includes("test"),
    );

    if (testBookmarks.length > 0) {
      console.log(`\n⚠️  Found ${testBookmarks.length} potential test bookmarks in production:`);
      testBookmarks.slice(0, 3).forEach(b => {
        console.log(`  - ${b.id}: ${b.title || "Untitled"}`);
      });
    } else {
      console.log("\n✅ No test bookmarks found in production");
    }

    return true;
  } catch (error) {
    console.error("Error checking production bookmarks:", error);
    return false;
  }
}

// Main execution
async function main() {
  console.log("🔧 BOOKMARK DIAGNOSTICS TOOL");
  console.log(`Running command: ${command}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log("=".repeat(50));

  let success = true;

  switch (command) {
    case "counts":
      success = await checkBookmarkCounts();
      break;

    case "integrity":
      success = await checkBookmarkIntegrity();
      break;

    case "structure":
      success = await checkBookmarkStructure();
      break;

    case "prod":
      success = await checkProductionBookmarks();
      break;

    case "all": {
      // Run all diagnostics
      const results = {
        counts: await checkBookmarkCounts(),
        integrity: await checkBookmarkIntegrity(),
        structure: await checkBookmarkStructure(),
        prod: await checkProductionBookmarks(),
      };

      console.log("\n" + "=".repeat(50));
      console.log("📊 OVERALL RESULTS:");
      console.log("─".repeat(40));
      Object.entries(results).forEach(([cmd, result]) => {
        console.log(`${result ? "✅" : "❌"} ${cmd}`);
      });

      success = Object.values(results).every(r => r);
      break;
    }
  }

  console.log("\n" + "=".repeat(50));
  if (success) {
    console.log("✅ Diagnostics completed successfully");
  } else {
    console.log("❌ Diagnostics found issues");
    process.exit(1);
  }
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
