#!/usr/bin/env bun

/**
 * Test S3 Image Loading
 * 
 * Verifies that images are being loaded directly from S3 CDN URLs
 * instead of going through proxy routes.
 */

import { readJsonS3 } from "@/lib/s3-utils";
import { BOOKMARKS_S3_PATHS } from "@/lib/constants";
import { selectBestImage } from "@/lib/bookmarks/bookmark-helpers";
import type { UnifiedBookmark } from "@/types/bookmark";

async function testS3ImageLoading() {
  console.log("🧪 Testing S3 Image Loading...\n");

  try {
    // Load bookmarks data from S3
    const bookmarks = await readJsonS3<UnifiedBookmark[]>(BOOKMARKS_S3_PATHS.FILE) || [];
    
    console.log(`📚 Loaded ${bookmarks.length} bookmarks\n`);

    // Stats
    let s3Count = 0;
    let proxyCount = 0;
    let noImageCount = 0;
    const s3CdnUrl = process.env.NEXT_PUBLIC_S3_CDN_URL || "https://s3-storage.callahan.cloud";

    // Sample of proxy URLs
    const proxyUrls: Array<{ url: string; bookmarkId: string; title: string }> = [];

    // Check each bookmark  
    for (const bookmark of bookmarks.slice(0, 50)) { // Check first 50
      // Also check the direct ogImage field
      const ogImage = bookmark.ogImage;
      const bestImage = selectBestImage(bookmark);
      
      console.log(`\n📖 ${bookmark.title}`);
      console.log(`   URL: ${bookmark.url}`);
      console.log(`   ogImage field: ${ogImage || "none"}`);
      console.log(`   selectBestImage: ${bestImage || "none"}`);
      
      // Check if ogImage is S3 but selectBestImage returns proxy
      if (ogImage?.includes(s3CdnUrl) && bestImage?.includes("/api/")) {
        console.log(`   ❌ BUG: ogImage is S3 but selectBestImage returns proxy!`);
      }
      
      if (!bestImage) {
        noImageCount++;
        continue;
      }

      if (bestImage.includes(s3CdnUrl)) {
        s3Count++;
        console.log(`   ✅ Using S3 CDN`);
      } else if (bestImage.includes("/api/")) {
        proxyCount++;
        proxyUrls.push({ url: bestImage, bookmarkId: bookmark.id, title: bookmark.title });
        console.log(`   ⚠️  Using PROXY`);
      } else if (bestImage.startsWith("http")) {
        s3Count++; // Direct external URLs are fine
        console.log(`   ✅ Using direct URL`);
      }
    }

    // Summary
    console.log("\n\n📊 SUMMARY:");
    console.log(`✅ S3/Direct URLs: ${s3Count}`);
    console.log(`⚠️  Proxy URLs: ${proxyCount}`);
    console.log(`❌ No images: ${noImageCount}`);
    console.log(`📏 Total checked: ${Math.min(50, bookmarks.length)}`);

    if (proxyCount > 0) {
      console.log("\n⚠️  Bookmarks still using proxy routes:");
      proxyUrls.forEach(({ title, url, bookmarkId }) => {
        console.log(`   - ${title} (${bookmarkId}): ${url}`);
      });
      console.log("\n💡 Run data-updater --bookmarks --force to persist these images to S3!");
    } else {
      console.log("\n🎉 All images are using direct S3/external URLs!");
    }

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

// Run the test
testS3ImageLoading();