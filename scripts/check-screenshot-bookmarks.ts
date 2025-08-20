#!/usr/bin/env bun

/**
 * Check bookmarks that only have screenshots
 */

import { readJsonS3 } from "@/lib/s3-utils";
import { BOOKMARKS_S3_PATHS } from "@/lib/constants";
import type { UnifiedBookmark } from "@/types/bookmark";

async function checkScreenshotBookmarks() {
  console.log("=== SCREENSHOT-ONLY BOOKMARKS CHECK ===");
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log("");

  try {
    const bookmarks = await readJsonS3<UnifiedBookmark[]>(BOOKMARKS_S3_PATHS.FILE);
    
    if (!bookmarks || !Array.isArray(bookmarks)) {
      console.log("❌ No bookmarks found");
      return;
    }

    console.log(`Total bookmarks: ${bookmarks.length}`);
    
    // Find bookmarks with only screenshots
    const screenshotOnly = bookmarks.filter(b => 
      !b.ogImage && 
      !b.ogImageExternal && 
      (!b.content?.imageUrl || b.content.imageUrl === null) &&
      !b.content?.imageAssetId &&
      b.content?.screenshotAssetId
    );
    
    console.log(`Bookmarks with ONLY screenshots: ${screenshotOnly.length}`);
    console.log("");
    
    // Show details of first few
    console.log("SAMPLE SCREENSHOT-ONLY BOOKMARKS:");
    screenshotOnly.slice(0, 5).forEach((b, i) => {
      console.log(`${i + 1}. ${b.title || "Untitled"}`);
      console.log(`   ID: ${b.id}`);
      console.log(`   URL: ${b.url}`);
      console.log(`   Screenshot Asset: ${b.content?.screenshotAssetId}`);
      console.log(`   ogImage: ${b.ogImage || "undefined"}`);
      console.log(`   ogImageExternal: ${b.ogImageExternal || "undefined"}`);
      console.log(`   content.imageUrl: ${b.content?.imageUrl || "null"}`);
      console.log(`   content.imageAssetId: ${b.content?.imageAssetId || "undefined"}`);
      console.log("");
    });
    
    // Check specific problem IDs from the logs
    const problemIds = [
      "bus159klcmgj7927gj7i92f7",
      "r1964pyr9gy22p08ad827vhv", 
      "crxluooxi4up9h01oe8p4t71"
    ];
    
    console.log("CHECKING SPECIFIC PROBLEM BOOKMARKS:");
    problemIds.forEach(id => {
      const bookmark = bookmarks.find(b => b.id === id);
      if (bookmark) {
        console.log(`Found: ${bookmark.title}`);
        console.log(`   Screenshot: ${bookmark.content?.screenshotAssetId}`);
        console.log(`   ogImage: ${bookmark.ogImage || "undefined"}`);
      } else {
        console.log(`Not found: ${id}`);
      }
    });

  } catch (error) {
    console.error("ERROR:", error);
  }

  console.log("");
  console.log("=== END CHECK ===");
}

checkScreenshotBookmarks().catch(console.error);