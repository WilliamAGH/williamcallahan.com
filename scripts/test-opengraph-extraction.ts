#!/usr/bin/env bun

/**
 * Test script to debug OpenGraph extraction for specific URLs
 */

import { getOpenGraphData } from "../lib/data-access/opengraph";

async function testOpenGraphExtraction(url: string) {
  console.log(`\n🔍 Testing OpenGraph extraction for: ${url}`);
  console.log("=".repeat(60));
  
  try {
    // Test with skipExternalFetch=false to force fresh fetch
    const result = await getOpenGraphData(url, false);
    
    console.log("\n📊 Result:");
    console.log(JSON.stringify(result, null, 2));
    
    if (result.ogMetadata) {
      console.log("\n🏷️ OpenGraph Metadata:");
      console.log(`  Title: ${result.ogMetadata.title || "N/A"}`);
      console.log(`  Description: ${result.ogMetadata.description || "N/A"}`);
      console.log(`  Image (raw): ${result.ogMetadata.image || "N/A"}`);
      console.log(`  Twitter Image: ${result.ogMetadata.twitterImage || "N/A"}`);
      console.log(`  URL: ${result.ogMetadata.url || "N/A"}`);
    }
    
    console.log("\n🖼️ Final Image URLs:");
    console.log(`  Primary Image URL: ${result.imageUrl || "N/A"}`);
    console.log(`  Banner Image URL: ${result.bannerImageUrl || "N/A"}`);
    
    if (result.error) {
      console.log(`\n❌ Error: ${result.error}`);
    }
    
    console.log(`\n📅 Timestamp: ${new Date(result.timestamp).toISOString()}`);
    console.log(`📍 Source: ${result.source}`);
    
  } catch (error) {
    console.error("\n❌ Failed to extract OpenGraph data:", error);
  }
}

// Test URLs
const testUrls = [
  "https://railway.app",
  "https://github.com/openai/whisper",
  "https://x.com/elonmusk"
];

async function runTests() {
  console.log("🚀 Starting OpenGraph extraction tests...\n");
  
  for (const url of testUrls) {
    await testOpenGraphExtraction(url);
    console.log("\n" + "-".repeat(60) + "\n");
  }
  
  console.log("✅ Tests completed!");
}

// Run the tests
void runTests();