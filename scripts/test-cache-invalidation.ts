#!/usr/bin/env bun
/**
 * Manual test script to verify cache invalidation is working
 * Run with: bun scripts/test-cache-invalidation.ts
 */

console.log("🧪 Testing Next.js Cache Invalidation\n");
console.log(`USE_NEXTJS_CACHE: ${process.env.USE_NEXTJS_CACHE || "false"}\n`);

// Test imports to verify functions exist
async function testImports() {
  console.log("📦 Testing module imports...\n");

  try {
    // Test Search
    const searchModule = await import("../lib/search");
    console.log("✅ Search module imported");
    console.log("  - invalidateSearchCache:", typeof searchModule.invalidateSearchCache);
    console.log("  - invalidateSearchQueryCache:", typeof searchModule.invalidateSearchQueryCache);

    // Test Bookmarks
    const bookmarksModule = await import("../lib/bookmarks/bookmarks-data-access.server");
    console.log("\n✅ Bookmarks module imported");
    console.log("  - invalidateBookmarksCache:", typeof bookmarksModule.invalidateBookmarksCache);
    console.log(
      "  - invalidateTagCache:",
      bookmarksModule.invalidateTagCache ? typeof bookmarksModule.invalidateTagCache : "undefined (missing)",
    );
    console.log(
      "  - invalidateBookmarkCache:",
      bookmarksModule.invalidateBookmarkCache ? typeof bookmarksModule.invalidateBookmarkCache : "undefined (missing)",
    );

    // Test Blog
    const blogModule = await import("../lib/blog/mdx");
    console.log("\n✅ Blog module imported");
    console.log("  - invalidateBlogCache:", typeof blogModule.invalidateBlogCache);
    console.log("  - invalidateBlogPostCache:", typeof blogModule.invalidateBlogPostCache);

    // Test GitHub
    const githubModule = await import("../lib/data-access/github");
    console.log("\n✅ GitHub module imported");
    console.log("  - invalidateGitHubCache:", typeof githubModule.invalidateGitHubCache);
  } catch (error) {
    console.error("❌ Import error:", error);
  }
}

// Test API routes
async function testAPIRoutes() {
  console.log("\n\n📡 Testing API Routes...\n");

  const baseUrl = process.env.SITE_URL || "http://localhost:3000";

  // Test bookmarks cache API
  console.log("Testing /api/cache/bookmarks...");
  try {
    const response = await fetch(`${baseUrl}/api/cache/bookmarks`, {
      method: "POST",
    });
    const data = await response.json();
    console.log(`  Response: ${response.status} - ${JSON.stringify(data)}`);
  } catch (error) {
    console.log("  ❌ Failed to call API:", error instanceof Error ? error.message : "Unknown error");
  }

  // Test GitHub refresh API (will fail without secret)
  console.log("\nTesting /api/github-activity/refresh...");
  try {
    const response = await fetch(`${baseUrl}/api/github-activity/refresh`, {
      method: "POST",
    });
    const data = await response.json();
    console.log(`  Response: ${response.status} - ${JSON.stringify(data).substring(0, 100)}...`);
  } catch (error) {
    console.log("  ❌ Failed to call API:", error instanceof Error ? error.message : "Unknown error");
  }
}

// Run tests
async function runTests() {
  await testImports();

  // Only test API routes if running against a live server
  if (process.argv.includes("--with-api")) {
    await testAPIRoutes();
  } else {
    console.log("\n\n💡 To test API routes, start the dev server and run:");
    console.log("   USE_NEXTJS_CACHE=true bun scripts/test-cache-invalidation.ts --with-api");
  }
}

runTests().catch(console.error);
