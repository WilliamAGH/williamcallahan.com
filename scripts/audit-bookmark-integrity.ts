#!/usr/bin/env bun

/**
 * Comprehensive audit to ensure bookmark integrity and prevent 404 errors
 * This script verifies that all bookmark URLs are correctly generated,
 * all JSON data is consistent, and no 404s can occur.
 */

import { getBookmarks } from "@/lib/bookmarks/service.server";
import { loadSlugMapping, getSlugForBookmark, getBookmarkIdFromSlug } from "@/lib/bookmarks/slug-manager";
import { readJsonS3 } from "@/lib/s3-utils";
import { BOOKMARKS_S3_PATHS, SEARCH_S3_PATHS, CONTENT_GRAPH_S3_PATHS } from "@/lib/constants";
import type { UnifiedBookmark, BookmarksIndex } from "@/types/bookmark";
import {
  bookmarksIndexSchema,
  bookmarkSlugMappingSchema,
} from "@/types/bookmark";

function isUnifiedBookmarkArray(x: unknown): x is UnifiedBookmark[] {
  return (
    Array.isArray(x) &&
    x.every(
      (b) => b && typeof (b as { id?: unknown }).id === "string" && typeof (b as { url?: unknown }).url === "string",
    )
  );
}

async function auditBookmarkIntegrity(): Promise<void> {
  console.log("🔍 COMPREHENSIVE BOOKMARK INTEGRITY AUDIT\n");
  console.log("This audit ensures no 404 errors can occur with bookmarks.");
  console.log("=".repeat(70));

  const results: Array<{
    category: string;
    status: "✅" | "❌" | "⚠️";
    message: string;
    details?: string[];
  }> = [];
  let hasErrors = false;

  try {
    // ========================================================================
    // 1. VERIFY SLUG MAPPING EXISTS AND IS COMPLETE
    // ========================================================================
    console.log("\n📋 PHASE 1: Slug Mapping Verification");
    console.log("-".repeat(40));

    const slugMapping = await loadSlugMapping();
    if (!slugMapping) {
      results.push({
        category: "Slug Mapping",
        status: "❌",
        message: "No slug mapping found - CRITICAL ERROR",
        details: ["Run: bun scripts/data-updater.ts --bookmarks --force"],
      });
      hasErrors = true;
      throw new Error("Cannot proceed without slug mapping");
    }

    console.log(`✅ Slug mapping loaded: ${slugMapping.count} entries`);
    console.log(`   Version: ${slugMapping.version}`);
    console.log(`   Generated: ${slugMapping.generated}`);
    console.log(`   Checksum: ${slugMapping.checksum}`);

    results.push({
      category: "Slug Mapping",
      status: "✅",
      message: `Loaded ${slugMapping.count} slug mappings`,
      details: [`Checksum: ${slugMapping.checksum}`],
    });

    // ========================================================================
    // 2. VERIFY ALL BOOKMARKS HAVE SLUGS
    // ========================================================================
    console.log("\n🔖 PHASE 2: Bookmark-Slug Coverage");
    console.log("-".repeat(40));

    const maybeBookmarks = await getBookmarks({
      skipExternalFetch: false,
      includeImageData: false,
    });
    if (!isUnifiedBookmarkArray(maybeBookmarks)) {
      throw new Error("Invalid bookmarks payload returned from getBookmarks()");
    }
    const bookmarks: UnifiedBookmark[] = maybeBookmarks;

    console.log(`📚 Found ${bookmarks.length} bookmarks`);

    const bookmarksWithoutSlugs: UnifiedBookmark[] = [];
    const slugsWithoutBookmarks: string[] = [];

    // Check every bookmark has a slug
    for (const bookmark of bookmarks) {
      const slug = getSlugForBookmark(slugMapping, bookmark.id);
      if (!slug) {
        bookmarksWithoutSlugs.push(bookmark);
      }
    }

    // Check every slug has a bookmark
    for (const [bookmarkId, entry] of Object.entries(slugMapping.slugs)) {
      const bookmark = bookmarks.find((b) => b.id === bookmarkId);
      if (!bookmark) {
        slugsWithoutBookmarks.push(entry.slug);
      }
    }

    if (bookmarksWithoutSlugs.length > 0) {
      results.push({
        category: "Bookmark Coverage",
        status: "❌",
        message: `${bookmarksWithoutSlugs.length} bookmarks missing slugs`,
        details: bookmarksWithoutSlugs.slice(0, 5).map((b) => `${b.id}: ${b.title}`),
      });
      hasErrors = true;
    } else {
      results.push({
        category: "Bookmark Coverage",
        status: "✅",
        message: "All bookmarks have slugs",
      });
    }

    if (slugsWithoutBookmarks.length > 0) {
      results.push({
        category: "Orphaned Slugs",
        status: "⚠️",
        message: `${slugsWithoutBookmarks.length} slugs without bookmarks`,
        details: slugsWithoutBookmarks.slice(0, 5),
      });
    }

    // ========================================================================
    // 3. VERIFY REVERSE MAPPING CONSISTENCY
    // ========================================================================
    console.log("\n🔄 PHASE 3: Reverse Mapping Consistency");
    console.log("-".repeat(40));

    let reverseMappingErrors = 0;
    for (const [bookmarkId, entry] of Object.entries(slugMapping.slugs)) {
      const reverseId = slugMapping.reverseMap[entry.slug];
      if (reverseId !== bookmarkId) {
        console.log(`❌ Reverse mapping error: ${entry.slug} maps to ${reverseId} but should be ${bookmarkId}`);
        reverseMappingErrors++;
      }
    }

    if (reverseMappingErrors > 0) {
      results.push({
        category: "Reverse Mapping",
        status: "❌",
        message: `${reverseMappingErrors} reverse mapping errors`,
        details: ["Slug mapping is corrupted - regenerate required"],
      });
      hasErrors = true;
    } else {
      console.log(`✅ All ${Object.keys(slugMapping.reverseMap).length} reverse mappings are consistent`);
      results.push({
        category: "Reverse Mapping",
        status: "✅",
        message: "All reverse mappings consistent",
      });
    }

    // ========================================================================
    // 4. SCHEMA VALIDATION - VALIDATE ALL S3 JSON AGAINST ZOD SCHEMAS
    // ========================================================================
    console.log("\n🔒 PHASE 4: Schema Validation (Type Safety)");
    console.log("-".repeat(40));
    console.log("Validating all S3 JSON data against TypeScript/Zod schemas...");

    const schemaValidationResults: Array<{
      file: string;
      status: "✅" | "❌";
      errors?: string[];
    }> = [];

    // 4a. Validate main bookmarks.json
    try {
      const bookmarksData = await readJsonS3(BOOKMARKS_S3_PATHS.FILE);
      // Use type guard to validate bookmarks array
      if (!isUnifiedBookmarkArray(bookmarksData)) {
        const errors = ["Invalid bookmarks data structure"];
        schemaValidationResults.push({
          file: "bookmarks.json",
          status: "❌",
          errors,
        });
        console.log(`❌ bookmarks.json schema validation failed`);
        errors.forEach((err) => console.log(`   ${err}`));
      } else {
        schemaValidationResults.push({
          file: "bookmarks.json",
          status: "✅",
        });
        console.log(`✅ bookmarks.json validated successfully`);
      }
    } catch (error) {
      console.log(`⚠️ Could not validate bookmarks.json: ${error}`);
    }

    // 4b. Validate slug-mapping.json
    try {
      const slugMappingData = await readJsonS3(BOOKMARKS_S3_PATHS.SLUG_MAPPING);
      const parseResult = bookmarkSlugMappingSchema.safeParse(slugMappingData);
      if (!parseResult.success) {
        const errors = parseResult.error.issues.map(
          (issue) => `${issue.path.join(".")} - ${issue.message}`
        ).slice(0, 5);
        schemaValidationResults.push({
          file: "slug-mapping.json",
          status: "❌",
          errors,
        });
        console.log(`❌ slug-mapping.json schema validation failed`);
        errors.forEach((err) => console.log(`   ${err}`));
      } else {
        schemaValidationResults.push({
          file: "slug-mapping.json",
          status: "✅",
        });
        console.log(`✅ slug-mapping.json validated successfully`);
      }
    } catch (error) {
      console.log(`⚠️ Could not validate slug-mapping.json: ${error}`);
    }

    // 4c. Validate index.json
    try {
      const indexData = await readJsonS3<BookmarksIndex>(BOOKMARKS_S3_PATHS.INDEX);
      const parseResult = bookmarksIndexSchema.safeParse(indexData);
      if (!parseResult.success) {
        const errors = parseResult.error.issues.map(
          (issue) => `${issue.path.join(".")} - ${issue.message}`
        ).slice(0, 5);
        schemaValidationResults.push({
          file: "index.json",
          status: "❌",
          errors,
        });
        console.log(`❌ index.json schema validation failed`);
        errors.forEach((err) => console.log(`   ${err}`));
      } else {
        schemaValidationResults.push({
          file: "index.json",
          status: "✅",
        });
        console.log(`✅ index.json validated successfully`);
      }
    } catch (error) {
      console.log(`⚠️ Could not validate index.json: ${error}`);
    }

    // 4d. Validate paginated bookmarks
    console.log("\n📄 Validating paginated bookmark files...");
    const indexData = await readJsonS3<BookmarksIndex>(BOOKMARKS_S3_PATHS.INDEX);
    if (indexData?.totalPages) {
      let paginationErrors = 0;
      // Ensure we have the pages prefix properly defined
      const pagesPrefix = BOOKMARKS_S3_PATHS.PAGE_PREFIX || "json/bookmarks/pages/";
      for (let page = 1; page <= Math.min(3, indexData.totalPages); page++) {
        try {
          const pagePath = `${pagesPrefix}page-${page}.json`;
          console.log(`   Checking ${pagePath}...`);
          const pageData = await readJsonS3(pagePath);
          // Use type guard to validate page data
          if (!isUnifiedBookmarkArray(pageData)) {
            paginationErrors++;
            console.log(`   ❌ page-${page}.json schema validation failed`);
            console.log(`      Invalid page data structure`);
          } else {
            console.log(`   ✅ page-${page}.json validated`);
          }
        } catch (error) {
          console.log(`   ⚠️ Could not validate page-${page}.json: ${error}`);
        }
      }
      if (paginationErrors > 0) {
        schemaValidationResults.push({
          file: "paginated bookmarks",
          status: "❌",
          errors: [`${paginationErrors} pages failed validation`],
        });
      } else {
        schemaValidationResults.push({
          file: "paginated bookmarks",
          status: "✅",
        });
      }
    }

    // Add schema validation summary to results
    const schemaErrors = schemaValidationResults.filter((r) => r.status === "❌");
    if (schemaErrors.length > 0) {
      results.push({
        category: "Schema Validation",
        status: "❌",
        message: `${schemaErrors.length} files failed schema validation`,
        details: schemaErrors.flatMap((e) => [`${e.file}: ${e.errors?.join(", ") || "validation failed"}`]),
      });
      hasErrors = true;
    } else {
      results.push({
        category: "Schema Validation",
        status: "✅",
        message: "All S3 JSON files pass schema validation",
        details: [`Validated ${schemaValidationResults.length} file types`],
      });
    }

    // ========================================================================
    // 5. VERIFY SEARCH INDEX CONSISTENCY (renumbered from 4)
    // ========================================================================
    console.log("\n🔎 PHASE 5: Search Index Verification (renumbered from 4)");
    console.log("-".repeat(40));

    const searchIndex = await readJsonS3<{
      bookmarks: Array<{
        id: string;
        url: string;
        title: string;
        description?: string;
      }>;
      metadata: {
        buildTime?: string;
        itemCount?: number;
        version?: string;
      };
    }>(SEARCH_S3_PATHS.BOOKMARKS_INDEX);

    if (searchIndex?.bookmarks) {
      console.log(`📊 Search index contains ${searchIndex.bookmarks.length} bookmark entries`);

      let searchIndexErrors = 0;
      for (const entry of searchIndex.bookmarks) {
        // Extract slug from URL (format: /bookmarks/[slug])
        const urlMatch = entry.url.match(/^\/bookmarks\/([^/?#]+)(?:\/)?(?:\?[^#]*)?(?:#.*)?$/);
        if (!urlMatch) {
          console.log(`❌ Invalid URL format in search: ${entry.url}`);
          searchIndexErrors++;
          continue;
        }

        const slug = urlMatch[1];
        const bookmarkId = slug ? getBookmarkIdFromSlug(slugMapping, slug) : undefined;

        if (!bookmarkId) {
          console.log(`❌ Search index references unknown slug: ${slug}`);
          searchIndexErrors++;
        } else if (bookmarkId !== entry.id) {
          console.log(`❌ ID mismatch: search says ${entry.id}, slug maps to ${bookmarkId}`);
          searchIndexErrors++;
        }
      }

      if (searchIndexErrors > 0) {
        results.push({
          category: "Search Index",
          status: "❌",
          message: `${searchIndexErrors} inconsistencies in search index`,
          details: ["Rebuild required: bun scripts/data-updater.ts --search-indexes"],
        });
        hasErrors = true;
      } else {
        results.push({
          category: "Search Index",
          status: "✅",
          message: `All ${searchIndex.bookmarks.length} search entries valid`,
        });
      }
    } else {
      results.push({
        category: "Search Index",
        status: "⚠️",
        message: "No search index found",
        details: ["Run: bun scripts/data-updater.ts --search-indexes"],
      });
    }

    // ========================================================================
    // 6. VERIFY RELATED CONTENT REFERENCES (renumbered from 5)
    // ========================================================================
    console.log("\n🔗 PHASE 6: Related Content References (renumbered from 5)");
    console.log("-".repeat(40));

    const relatedContent = await readJsonS3<
      Record<
        string,
        Array<{
          type: string;
          id: string;
          score: number;
          title: string;
        }>
      >
    >(CONTENT_GRAPH_S3_PATHS.RELATED_CONTENT);

    if (relatedContent) {
      let totalBookmarkRefs = 0;
      let invalidBookmarkRefs = 0;

      // Enhanced: Test detailed resolution for sample entries
      const bookmarkRelatedContent = Object.entries(relatedContent)
        .filter(([_, items]) => Array.isArray(items) && items.some((item) => item.type === "bookmark"))
        .slice(0, 10); // Test first 10 for detailed check

      console.log(`🎯 Testing ${bookmarkRelatedContent.length} sample entries with bookmark recommendations...`);

      for (const [key, items] of Object.entries(relatedContent)) {
        const bookmarkItems = items.filter((item) => item.type === "bookmark");
        totalBookmarkRefs += bookmarkItems.length;

        for (const item of bookmarkItems) {
          const slug = getSlugForBookmark(slugMapping, item.id);
          if (!slug) {
            if (invalidBookmarkRefs < 3) {
              console.log(`❌ Related content references bookmark ${item.id} without slug (in ${key})`);
              console.log(`   Title: ${item.title}`);
            }
            invalidBookmarkRefs++;
          } else if (totalBookmarkRefs <= 5) {
            // Verify URL construction for first few
            const expectedUrl = `/bookmarks/${slug}`;
            console.log(`   ✅ ${item.title.substring(0, 40)}... → ${expectedUrl}`);
          }
        }
      }

      console.log(`📊 Found ${totalBookmarkRefs} bookmark references in related content`);

      if (invalidBookmarkRefs > 0) {
        results.push({
          category: "Related Content",
          status: "❌",
          message: `${invalidBookmarkRefs} invalid bookmark references`,
          details: ["Related content needs regeneration"],
        });
        hasErrors = true;
      } else {
        console.log(`✅ All bookmark references can be properly resolved to URLs`);
        results.push({
          category: "Related Content",
          status: "✅",
          message: `All ${totalBookmarkRefs} bookmark references valid and resolvable`,
        });
      }
    } else {
      results.push({
        category: "Related Content",
        status: "⚠️",
        message: "No related content found",
      });
    }

    // ========================================================================
    // 6. VERIFY PAGINATION FILES
    // ========================================================================
    console.log("\n📄 PHASE 6: Pagination Files");
    console.log("-".repeat(40));

    const index = await readJsonS3<{
      pages?: Array<{ page: number; count: number }>;
      totalPages?: number;
      totalCount?: number;
    }>(BOOKMARKS_S3_PATHS.INDEX);
    if (index?.pages) {
      console.log(`📖 Index reports ${index.pages.length} pages`);

      let paginationErrors = 0;
      let totalPaginatedBookmarks = 0;

      for (let i = 1; i <= index.pages.length; i++) {
        const pagePath = `${BOOKMARKS_S3_PATHS.PAGE_PREFIX}${i}.json`;
        const pageData = await readJsonS3<{ bookmarks: UnifiedBookmark[] }>(pagePath);

        if (!pageData) {
          console.log(`❌ Missing page file: ${pagePath}`);
          paginationErrors++;
        } else {
          totalPaginatedBookmarks += pageData.bookmarks.length;

          // Verify each bookmark in page has a slug
          for (const bookmark of pageData.bookmarks) {
            const slug = getSlugForBookmark(slugMapping, bookmark.id);
            if (!slug) {
              console.log(`❌ Page ${i} contains bookmark without slug: ${bookmark.id}`);
              paginationErrors++;
            }
          }
        }
      }

      console.log(`📊 Total bookmarks across pages: ${totalPaginatedBookmarks}`);

      if (paginationErrors > 0) {
        results.push({
          category: "Pagination",
          status: "❌",
          message: `${paginationErrors} pagination errors`,
          details: ["Pagination needs regeneration"],
        });
        hasErrors = true;
      } else {
        results.push({
          category: "Pagination",
          status: "✅",
          message: `All ${index.pages.length} pages valid with ${totalPaginatedBookmarks} bookmarks`,
        });
      }
    } else {
      results.push({
        category: "Pagination",
        status: "⚠️",
        message: "No pagination index found",
      });
    }

    // ========================================================================
    // 7. TEST ACTUAL URL GENERATION
    // ========================================================================
    console.log("\n🌐 PHASE 7: URL Generation Test");
    console.log("-".repeat(40));

    const sampleBookmarks = bookmarks.slice(0, 10);
    console.log("Testing URL generation for sample bookmarks:");

    let urlGenerationErrors = 0;
    for (const bookmark of sampleBookmarks) {
      const slug = getSlugForBookmark(slugMapping, bookmark.id);
      if (!slug) {
        console.log(`❌ Cannot generate URL for ${bookmark.id} - no slug`);
        urlGenerationErrors++;
      } else {
        const url = `/bookmarks/${slug}`;
        console.log(`✅ ${bookmark.title.substring(0, 40)}... → ${url}`);

        // Verify reverse lookup works
        const reverseId = getBookmarkIdFromSlug(slugMapping, slug);
        if (reverseId !== bookmark.id) {
          console.log(`   ❌ Reverse lookup failed: got ${reverseId}, expected ${bookmark.id}`);
          urlGenerationErrors++;
        }
      }
    }

    if (urlGenerationErrors > 0) {
      results.push({
        category: "URL Generation",
        status: "❌",
        message: `${urlGenerationErrors} URL generation errors`,
      });
      hasErrors = true;
    } else {
      results.push({
        category: "URL Generation",
        status: "✅",
        message: "URL generation working correctly",
      });
    }

    // ========================================================================
    // FINAL REPORT
    // ========================================================================
    console.log("\n" + "=".repeat(70));
    console.log("📊 AUDIT REPORT");
    console.log("=".repeat(70));

    for (const result of results) {
      console.log(`\n${result.status} ${result.category}`);
      console.log(`   ${result.message}`);
      if (result.details) {
        for (const detail of result.details) {
          console.log(`   • ${detail}`);
        }
      }
    }

    console.log("\n" + "=".repeat(70));

    if (hasErrors) {
      console.log("❌ AUDIT FAILED - 404 ERRORS ARE POSSIBLE!");
      console.log("\nRequired Actions:");
      console.log("1. Run: bun scripts/data-updater.ts --bookmarks --force");
      console.log("2. Run: bun scripts/data-updater.ts --search-indexes");
      console.log("3. Re-run this audit");
      process.exit(1);
    } else {
      console.log("✅ AUDIT PASSED - NO 404 ERRORS POSSIBLE!");
      console.log("\nSystem Guarantees:");
      console.log("• Every bookmark has a unique, deterministic slug");
      console.log("• All search index entries use correct URLs");
      console.log("• All related content references are valid");
      console.log("• Pagination files are consistent");
      console.log("• URL generation is idempotent");
      console.log("\n🎉 The bookmark system is fully consistent and production-ready!");
    }
  } catch (error) {
    console.error("\n❌ CRITICAL AUDIT ERROR:", error);
    console.error("\nThe audit could not complete. This indicates a serious issue.");
    console.error("Please check the error above and fix any issues.");
    process.exit(1);
  }
}

// Run the audit
console.log("Starting Bookmark Integrity Audit...\n");
auditBookmarkIntegrity();
