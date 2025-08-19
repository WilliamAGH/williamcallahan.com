#!/usr/bin/env bun

/**
 * Check the slug mapping in S3 and locally
 */

import { readJsonS3 } from "@/lib/s3-utils";
import { BOOKMARKS_S3_PATHS } from "@/lib/constants";
import type { BookmarkSlugMapping } from "@/types/bookmark";

async function checkSlugMapping() {
  console.log("=== SLUG MAPPING CHECK ===");
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log("");

  try {
    // Check S3 slug mapping
    console.log("1. CHECKING S3 SLUG MAPPING:");
    console.log(`   Path: ${BOOKMARKS_S3_PATHS.SLUG_MAPPING}`);
    
    const s3Mapping = await readJsonS3<BookmarkSlugMapping>(BOOKMARKS_S3_PATHS.SLUG_MAPPING);
    
    if (!s3Mapping) {
      console.log("   ❌ No slug mapping found in S3");
      return;
    }

    console.log(`   ✅ Found slug mapping in S3`);
    console.log(`   Version: ${s3Mapping.version}`);
    console.log(`   Generated: ${s3Mapping.generated}`);
    console.log(`   Total slugs: ${s3Mapping.count}`);
    
    // Check if it's test data
    const slugEntries = Object.entries(s3Mapping.slugs || {});
    if (slugEntries.length === 1 && slugEntries[0]?.[0] === "test") {
      console.log("   ⚠️  WARNING: S3 slug mapping contains only test data!");
    }
    
    // Sample some slugs
    console.log("");
    console.log("2. SAMPLE SLUGS (first 5):");
    slugEntries.slice(0, 5).forEach(([id, entry]) => {
      if (typeof entry === 'object' && entry !== null && 'slug' in entry && 'title' in entry && 'url' in entry) {
        console.log(`   ${entry.slug} -> ${id}`);
        console.log(`      Title: ${entry.title}`);
        console.log(`      URL: ${entry.url}`);
      }
    });
    
    // Check local file
    console.log("");
    console.log("3. LOCAL SLUG MAPPING:");
    const fs = await import("fs/promises");
    const path = await import("path");
    const localPath = path.join(process.cwd(), "lib", "data", "slug-mapping.json");
    
    try {
      const localData = await fs.readFile(localPath, "utf-8");
      const localMapping = JSON.parse(localData) as BookmarkSlugMapping;
      console.log(`   ✅ Found local slug mapping`);
      console.log(`   Total slugs: ${localMapping.count}`);
      
      if (localMapping.count !== s3Mapping.count) {
        console.log(`   ⚠️  Mismatch: Local has ${localMapping.count}, S3 has ${s3Mapping.count}`);
      }
    } catch {
      console.log("   ❌ No local slug mapping file (will be regenerated on next load)");
    }

  } catch (error) {
    console.error("ERROR:", error);
  }

  console.log("");
  console.log("=== END SLUG MAPPING CHECK ===");
}

// Run the check
checkSlugMapping().catch(console.error);