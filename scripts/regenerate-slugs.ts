#!/usr/bin/env bun

/**
 * Force regeneration of slug mappings from existing bookmarks
 */

import "dotenv/config";
import { getBookmarks } from "@/lib/bookmarks/service.server";
import { generateSlugMapping, saveSlugMapping, LOCAL_SLUG_MAPPING_PATH } from "@/lib/bookmarks/slug-manager";
import type { UnifiedBookmark } from "@/types";

/**
 * Runtime validation helper to ensure bookmark data conforms to expected structure
 */
function validateBookmarks(data: unknown): UnifiedBookmark[] {
  if (!Array.isArray(data)) {
    throw new Error("[SlugRegen] Expected array of bookmarks, got: " + typeof data);
  }

  // Validate essential fields exist on each bookmark
  for (const item of data) {
    if (!item || typeof item !== "object") {
      throw new Error("[SlugRegen] Invalid bookmark item: not an object");
    }

    const bookmark = item as Record<string, unknown>;

    // Check required fields for slug generation
    if (typeof bookmark.id !== "string" || !bookmark.id) {
      throw new Error("[SlugRegen] Invalid bookmark: missing or invalid 'id' field");
    }

    if (typeof bookmark.url !== "string" || !bookmark.url) {
      throw new Error("[SlugRegen] Invalid bookmark: missing or invalid 'url' field");
    }

    if (typeof bookmark.title !== "string" && bookmark.title !== null && bookmark.title !== undefined) {
      throw new Error("[SlugRegen] Invalid bookmark: 'title' must be string or null/undefined");
    }
  }

  // Safe to cast after validation
  return data as UnifiedBookmark[];
}

async function regenerateSlugs() {
  console.log("=== SLUG REGENERATION ===");
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log("");

  try {
    // Load bookmarks from S3
    console.log("1. Loading bookmarks from S3...");
    const rawData = await getBookmarks({ includeImageData: false });
    const bookmarks = validateBookmarks(rawData);
    console.log(`   ✅ Loaded and validated ${bookmarks.length} bookmarks`);

    // Generate slug mapping
    console.log("");
    console.log("2. Generating slug mapping...");
    const mapping = generateSlugMapping(bookmarks);
    console.log(`   ✅ Generated ${mapping.count} slugs`);

    // Sample some mappings
    console.log("");
    console.log("3. Sample mappings (first 5):");
    Object.values(mapping.slugs)
      .slice(0, 5)
      .forEach(entry => {
        console.log(`   ${entry.slug} -> ${entry.id}`);
      });

    // Save the mapping
    console.log("");
    console.log("4. Saving slug mapping to S3 and local cache...");
    await saveSlugMapping(bookmarks);
    console.log("   ✅ Slug mapping saved successfully");

    // Verify it saved correctly
    const fs = await import("node:fs/promises");
    const localPath = LOCAL_SLUG_MAPPING_PATH;

    try {
      const localData = await fs.readFile(localPath, "utf-8");
      const savedMapping = JSON.parse(localData);
      console.log("");
      console.log("5. Verification:");
      console.log(`   ✅ Local file saved with ${savedMapping.count} slugs`);
    } catch (err) {
      console.log("");
      console.log("5. Verification:");
      console.log(`   ⚠️  Could not verify local file: ${err}`);
    }
  } catch (error) {
    console.error("ERROR:", error);
  }

  console.log("");
  console.log("=== END SLUG REGENERATION ===");
}

// Run the regeneration
regenerateSlugs().catch(console.error);
