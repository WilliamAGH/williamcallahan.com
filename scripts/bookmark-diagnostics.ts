#!/usr/bin/env bun

/**
 * Consolidated Bookmark Diagnostics Tool
 *
 * PostgreSQL-backed diagnostics for bookmark data integrity.
 *
 * Usage:
 *   bun run scripts/bookmark-diagnostics.ts [command]
 *
 * Commands:
 *   counts     - Check bookmark counts and pagination (default)
 *   integrity  - Full integrity audit including slug mapping and page queries
 *   structure  - Analyze bookmark field structure
 *   prod       - Check for likely test data in production dataset
 *   all        - Run all diagnostics
 */

import {
  getAllBookmarks,
  getBookmarksIndexFromDatabase,
  getBookmarksPage,
} from "@/lib/db/queries/bookmarks";
import {
  getBookmarkIdFromSlug,
  getSlugForBookmark,
  loadSlugMapping,
} from "@/lib/bookmarks/slug-manager";
import type { UnifiedBookmark } from "@/types/bookmark";

const VALID_COMMANDS = ["counts", "integrity", "structure", "prod", "all"] as const;
const commandInput = process.argv[2]?.trim() || "counts";

const isCommand = (input: string): input is (typeof VALID_COMMANDS)[number] =>
  (VALID_COMMANDS as readonly string[]).includes(input);

if (!isCommand(commandInput)) {
  console.error(`Invalid command: ${commandInput}`);
  console.error(`Valid commands: ${VALID_COMMANDS.join(", ")}`);
  process.exit(1);
}

const command = commandInput;

async function loadBookmarkSnapshot(): Promise<{
  bookmarks: UnifiedBookmark[];
  index: Awaited<ReturnType<typeof getBookmarksIndexFromDatabase>>;
}> {
  const [bookmarks, index] = await Promise.all([
    getAllBookmarks(),
    getBookmarksIndexFromDatabase(),
  ]);
  return { bookmarks, index };
}

function printHeader(title: string): void {
  console.log(`\n${title}`);
  console.log("=".repeat(50));
}

function isLikelyTestBookmark(bookmark: UnifiedBookmark): boolean {
  return (
    bookmark.id.includes("test") ||
    bookmark.url.includes("example.com") ||
    (bookmark.title?.toLowerCase().includes("test") ?? false)
  );
}

async function checkBookmarkCounts(): Promise<boolean> {
  printHeader("BOOKMARK COUNT ANALYSIS (POSTGRESQL)");

  try {
    const { bookmarks, index } = await loadBookmarkSnapshot();
    const expectedPages = Math.ceil(bookmarks.length / index.pageSize);
    const ids = bookmarks.map((bookmark) => bookmark.id);
    const uniqueIds = new Set(ids);
    const duplicateCount = ids.length - uniqueIds.size;

    console.log(`Bookmark rows in PostgreSQL: ${bookmarks.length}`);
    console.log(`bookmark_index_state count:  ${index.count}`);
    console.log(`Count match: ${bookmarks.length === index.count ? "YES" : "NO"}`);
    console.log("");
    console.log("Pagination:");
    console.log(`Expected pages: ${expectedPages}`);
    console.log(`Index pages:    ${index.totalPages}`);
    console.log(`Pages match:    ${expectedPages === index.totalPages ? "YES" : "NO"}`);
    console.log("");
    console.log("Duplicate ID Check:");
    console.log(`Total IDs:  ${ids.length}`);
    console.log(`Unique IDs: ${uniqueIds.size}`);
    console.log(`Duplicates: ${duplicateCount}`);

    return (
      bookmarks.length === index.count && expectedPages === index.totalPages && duplicateCount === 0
    );
  } catch (error) {
    console.error("Counts check failed:", error);
    return false;
  }
}

async function checkBookmarkIntegrity(): Promise<boolean> {
  printHeader("COMPREHENSIVE INTEGRITY AUDIT (POSTGRESQL)");

  const failures: string[] = [];
  const warnings: string[] = [];

  try {
    const { bookmarks, index } = await loadBookmarkSnapshot();
    const slugMapping = await loadSlugMapping();

    if (!slugMapping) {
      console.error("No slug mapping loaded from PostgreSQL-backed slug manager.");
      return false;
    }

    if (slugMapping.count !== bookmarks.length) {
      failures.push(
        `Slug mapping count mismatch: mapping=${slugMapping.count}, bookmarks=${bookmarks.length}`,
      );
    }

    const missingEmbeddedSlug: string[] = [];
    const missingMappingSlug: string[] = [];
    const reverseMapMismatch: string[] = [];
    const embeddedSlugMismatch: string[] = [];

    for (const bookmark of bookmarks) {
      if (!bookmark.slug || bookmark.slug.trim().length === 0) {
        missingEmbeddedSlug.push(bookmark.id);
      }

      const mappedSlug = getSlugForBookmark(slugMapping, bookmark.id);
      if (!mappedSlug) {
        missingMappingSlug.push(bookmark.id);
        continue;
      }

      if (bookmark.slug && bookmark.slug !== mappedSlug) {
        embeddedSlugMismatch.push(bookmark.id);
      }

      const reverseId = getBookmarkIdFromSlug(slugMapping, mappedSlug);
      if (reverseId !== bookmark.id) {
        reverseMapMismatch.push(bookmark.id);
      }
    }

    if (missingEmbeddedSlug.length > 0) {
      failures.push(`${missingEmbeddedSlug.length} bookmarks missing embedded slug values.`);
    }
    if (missingMappingSlug.length > 0) {
      failures.push(`${missingMappingSlug.length} bookmarks missing slug-manager mapping entries.`);
    }
    if (reverseMapMismatch.length > 0) {
      failures.push(
        `${reverseMapMismatch.length} bookmarks failed slug reverse lookup validation.`,
      );
    }
    if (embeddedSlugMismatch.length > 0) {
      warnings.push(
        `${embeddedSlugMismatch.length} bookmarks have embedded slug values that differ from slug-manager mappings.`,
      );
    }

    const maxPagesToCheck = Math.min(3, index.totalPages);
    for (let pageNumber = 1; pageNumber <= maxPagesToCheck; pageNumber++) {
      const pageRows = await getBookmarksPage(pageNumber, index.pageSize);
      if (pageRows.length === 0) {
        failures.push(`Page ${pageNumber} returned zero rows unexpectedly.`);
        continue;
      }

      const missingPageSlugCount = pageRows.filter(
        (bookmark) => !bookmark.slug || bookmark.slug.trim().length === 0,
      ).length;

      if (missingPageSlugCount > 0) {
        failures.push(
          `Page ${pageNumber} has ${missingPageSlugCount} bookmarks missing slug values.`,
        );
      }
    }

    console.log(`Bookmarks checked: ${bookmarks.length}`);
    console.log(`Slug mapping entries: ${slugMapping.count}`);
    console.log(`Index count: ${index.count}`);
    console.log(`Pages sampled: ${maxPagesToCheck}`);

    if (warnings.length > 0) {
      console.log("\nWarnings:");
      for (const warning of warnings) {
        console.log(`- ${warning}`);
      }
    }

    if (failures.length > 0) {
      console.log("\nFailures:");
      for (const failure of failures) {
        console.log(`- ${failure}`);
      }
      return false;
    }

    console.log("\nAll integrity checks passed.");
    return true;
  } catch (error) {
    console.error("Integrity check failed:", error);
    return false;
  }
}

async function checkBookmarkStructure(): Promise<boolean> {
  printHeader("BOOKMARK STRUCTURE ANALYSIS (POSTGRESQL)");

  try {
    const { bookmarks } = await loadBookmarkSnapshot();
    if (bookmarks.length === 0) {
      console.error("No bookmarks found.");
      return false;
    }

    const fieldPresence = new Map<string, number>();
    const fieldTypes = new Map<string, Set<string>>();

    for (const bookmark of bookmarks) {
      for (const key of Object.keys(bookmark)) {
        fieldPresence.set(key, (fieldPresence.get(key) ?? 0) + 1);
        const currentTypes = fieldTypes.get(key) ?? new Set<string>();
        const value = (bookmark as Record<string, unknown>)[key];
        currentTypes.add(value === null ? "null" : typeof value);
        fieldTypes.set(key, currentTypes);
      }
    }

    console.log(`Bookmarks analyzed: ${bookmarks.length}`);
    console.log("Field | Present In | Types");
    console.log("------|------------|------");

    const sortedFields = [...fieldPresence.entries()].toSorted((a, b) => b[1] - a[1]);
    for (const [field, count] of sortedFields) {
      const percentage = ((count / bookmarks.length) * 100).toFixed(1);
      const types = [...(fieldTypes.get(field) ?? new Set(["unknown"]))].join(", ");
      console.log(`${field.padEnd(20)} | ${`${percentage}%`.padEnd(10)} | ${types}`);
    }

    const criticalFields = ["id", "url", "title", "slug"];
    let criticalFieldMissing = false;
    console.log("\nCritical fields:");
    for (const field of criticalFields) {
      const count = fieldPresence.get(field) ?? 0;
      const ok = count === bookmarks.length;
      criticalFieldMissing ||= !ok;
      console.log(`- ${field}: ${ok ? "OK" : `MISSING on ${bookmarks.length - count} rows`}`);
    }

    return !criticalFieldMissing;
  } catch (error) {
    console.error("Structure check failed:", error);
    return false;
  }
}

async function checkProductionBookmarks(): Promise<boolean> {
  printHeader("PRODUCTION DATA SAFETY CHECK (POSTGRESQL)");

  try {
    const { bookmarks, index } = await loadBookmarkSnapshot();
    if (bookmarks.length === 0) {
      console.error("No bookmarks found.");
      return false;
    }

    const likelyTestBookmarks = bookmarks.filter(isLikelyTestBookmark);
    console.log(`Bookmark rows: ${bookmarks.length}`);
    console.log(`Index count:   ${index.count}`);

    if (likelyTestBookmarks.length > 0) {
      console.log(
        `\nWarning: found ${likelyTestBookmarks.length} likely test bookmarks. First 3 examples:`,
      );
      for (const bookmark of likelyTestBookmarks.slice(0, 3)) {
        console.log(`- ${bookmark.id}: ${bookmark.title || "Untitled"}`);
      }
    } else {
      console.log("\nNo likely test bookmarks found.");
    }

    return bookmarks.length === index.count;
  } catch (error) {
    console.error("Production check failed:", error);
    return false;
  }
}

async function main(): Promise<void> {
  console.log("BOOKMARK DIAGNOSTICS TOOL");
  console.log(`Command:   ${command}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log("Storage:   PostgreSQL-backed bookmark runtime");

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
      const results = {
        counts: await checkBookmarkCounts(),
        integrity: await checkBookmarkIntegrity(),
        structure: await checkBookmarkStructure(),
        prod: await checkProductionBookmarks(),
      };

      printHeader("OVERALL RESULTS");
      for (const [name, passed] of Object.entries(results)) {
        console.log(`- ${name}: ${passed ? "PASS" : "FAIL"}`);
      }
      success = Object.values(results).every(Boolean);
      break;
    }
  }

  console.log("\n" + "=".repeat(50));
  if (success) {
    console.log("Diagnostics completed successfully.");
    return;
  }

  console.log("Diagnostics found issues.");
  process.exit(1);
}

main().catch((error) => {
  console.error("Fatal diagnostics error:", error);
  process.exit(1);
});
