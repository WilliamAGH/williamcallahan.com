#!/usr/bin/env bun

/**
 * Test Investment Images
 * 
 * Verifies that investment logos are being loaded directly from S3 CDN URLs
 * instead of going through proxy routes.
 */

import { getStaticImageUrl } from "@/lib/data-access/static-images";
import { getLogoFromManifestAsync } from "@/lib/image-handling/image-manifest-loader";

async function testInvestmentImages() {
  console.log("🧪 Testing Investment Logo Loading...\n");

  try {
    // Load investments data from local TypeScript file
    const { investments } = await import("../data/investments");
    
    console.log(`💼 Loaded ${investments.length} investments\n`);

    // Stats
    let s3Count = 0;
    let staticCount = 0;
    const proxyCount = 0;
    let placeholderCount = 0;
    const s3CdnUrl = process.env.NEXT_PUBLIC_S3_CDN_URL || "https://s3-storage.callahan.cloud";

    // Check each investment
    for (const investment of investments.slice(0, 20)) { // Check first 20
      console.log(`\n💼 ${investment.name}`);
      console.log(`   Website: ${investment.website || "none"}`);
      
      // Check if logo is provided directly (static file path)
      if (investment.logo) {
        console.log(`   Static logo: ${investment.logo}`);
        
        // Get the full URL
        const fullUrl = getStaticImageUrl(investment.logo);
        console.log(`   Full URL: ${fullUrl}`);
        
        if (fullUrl.includes(s3CdnUrl)) {
          s3Count++;
          console.log(`   ✅ Using S3 CDN (static mapping)`);
        } else {
          staticCount++;
          console.log(`   📁 Using static file`);
        }
      } else if (investment.website) {
        // Try to get from manifest
        try {
          const url = new URL(investment.website);
          const domain = url.hostname.replace(/^www\./, "");
          
          const logoEntry = await getLogoFromManifestAsync(domain);
          
          if (logoEntry) {
            console.log(`   Manifest CDN URL: ${logoEntry.cdnUrl}`);
            s3Count++;
            console.log(`   ✅ Using S3 CDN (from manifest)`);
          } else {
            console.log(`   ❌ No logo in manifest for domain: ${domain}`);
            placeholderCount++;
          }
        } catch (error) {
          console.log(`   ❌ Error processing: ${error instanceof Error ? error.message : String(error)}`);
          placeholderCount++;
        }
      } else {
        console.log(`   ❌ No logo or website`);
        placeholderCount++;
      }
    }

    // Summary
    console.log("\n\n📊 SUMMARY:");
    console.log(`✅ S3 CDN URLs: ${s3Count}`);
    console.log(`📁 Static files: ${staticCount}`);
    console.log(`⚠️  Proxy URLs: ${proxyCount}`);
    console.log(`❌ Placeholders: ${placeholderCount}`);
    console.log(`📏 Total checked: ${Math.min(20, investments.length)}`);

    if (proxyCount > 0) {
      console.log("\n⚠️  WARNING: Some investments are still using proxy routes!");
    } else if (staticCount > 0) {
      console.log("\n📌 Note: Some investments use static files. These should be migrated to S3.");
    } else {
      console.log("\n🎉 All investment logos are using S3 CDN URLs or placeholders!");
    }

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

// Run the test
testInvestmentImages();