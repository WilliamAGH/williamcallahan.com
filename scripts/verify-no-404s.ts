#!/usr/bin/env bun

/**
 * Verify No 404s - Comprehensive Sitemap URL Validation
 *
 * This script loads the actual sitemap and verifies every URL returns 200 OK.
 * It's designed to catch any 404 regressions before deployment.
 *
 * Usage:
 *   bun scripts/verify-no-404s.ts [--local|--production|--dev]
 *
 * Options:
 *   --local       Test against localhost:3000 (default)
 *   --production  Test against williamcallahan.com
 *   --dev         Test against dev.williamcallahan.com
 *   --sample N    Test only N random URLs (for quick checks)
 *   --verbose     Show all URL test results
 */

import sitemap from "../src/app/sitemap";
import type { MetadataRoute } from "next";

// Parse command line arguments
const args = process.argv.slice(2);
const isProduction = args.includes("--production");
const isDev = args.includes("--dev");
const isVerbose = args.includes("--verbose");
const sampleIndex = args.indexOf("--sample");
const sampleArg = sampleIndex >= 0 ? args[sampleIndex + 1] : undefined;
const sampleSize = sampleArg ? parseInt(sampleArg, 10) : null;

// Determine base URL
const BASE_URL = isProduction
  ? "https://williamcallahan.com"
  : isDev
    ? "https://dev.williamcallahan.com"
    : "http://localhost:3000";

console.log(`🔍 SITEMAP URL VERIFICATION`);
console.log(`Testing against: ${BASE_URL}`);
console.log("=".repeat(60));

/**
 * Test URL reachability using HEAD request (adapted from validate-investment-urls.ts)
 */
async function testUrl(url: string): Promise<{
  url: string;
  status: number;
  ok: boolean;
  responseTime: number;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      headers: {
        "User-Agent": "williamcallahan.com-404-checker/1.0",
      },
    });

    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;

    return {
      url,
      status: response.status,
      ok: response.ok,
      responseTime,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    let errorMsg = "Unknown error";

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        errorMsg = "Timeout (>10s)";
      } else if (error.message.includes("ECONNREFUSED")) {
        errorMsg = "Connection refused (is the server running?)";
      } else {
        errorMsg = error.message;
      }
    }

    return {
      url,
      status: 0,
      ok: false,
      responseTime,
      error: errorMsg,
    };
  }
}

/**
 * Process URLs in batches with concurrency control
 */
async function processBatch(
  urls: string[],
  concurrencyLimit: number = 5,
): Promise<Array<Awaited<ReturnType<typeof testUrl>>>> {
  const results: Array<Awaited<ReturnType<typeof testUrl>>> = [];
  const queue = [...urls];
  const activePromises = new Set<Promise<void>>();

  while (queue.length > 0 || activePromises.size > 0) {
    // Start new tasks up to concurrency limit
    while (queue.length > 0 && activePromises.size < concurrencyLimit) {
      const url = queue.shift();
      if (!url) break;

      const promise = testUrl(url)
        .then((result) => {
          results.push(result);
          if (isVerbose || !result.ok) {
            const icon = result.ok ? "✅" : "❌";
            const status = result.status || "ERR";
            console.log(`${icon} [${status}] ${result.url} (${result.responseTime}ms)`);
          }
          return undefined;
        })
        .finally(() => {
          activePromises.delete(promise);
        });

      activePromises.add(promise);
    }

    // Wait for at least one promise to complete
    if (activePromises.size > 0) {
      await Promise.race(activePromises);
    }
  }

  return results;
}

async function main() {
  console.log("\n📋 Loading sitemap...");

  // Load the actual sitemap
  const sitemapEntries: MetadataRoute.Sitemap = await sitemap();

  // Convert sitemap URLs to use the target base URL
  const urls = sitemapEntries.map((entry) => {
    // Replace the sitemap's base URL with our test target
    const url = new URL(entry.url);
    const targetUrl = new URL(BASE_URL);
    url.protocol = targetUrl.protocol;
    url.host = targetUrl.host;
    return url.toString();
  });

  console.log(`Found ${urls.length} URLs in sitemap`);

  // Sample URLs if requested
  const urlsToTest =
    sampleSize && sampleSize < urls.length
      ? urls.toSorted(() => Math.random() - 0.5).slice(0, sampleSize)
      : urls;

  if (sampleSize) {
    console.log(`Testing random sample of ${urlsToTest.length} URLs`);
  }

  console.log("\n🚀 Starting URL verification...\n");

  const startTime = Date.now();
  const results = await processBatch(urlsToTest, 5);
  const duration = Date.now() - startTime;

  // Analyze results
  const successful = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  const notFound = results.filter((r) => r.status === 404);
  const serverErrors = results.filter((r) => r.status >= 500);
  const timeouts = results.filter((r) => r.error?.includes("Timeout"));
  const connectionErrors = results.filter((r) => r.error?.includes("Connection refused"));

  // Calculate stats
  const avgResponseTime =
    results.length > 0 ? results.reduce((sum, r) => sum + r.responseTime, 0) / results.length : 0;
  const slowest =
    results.length > 0 ? results.toSorted((a, b) => b.responseTime - a.responseTime)[0] : null;

  console.log("\n" + "=".repeat(60));
  console.log("📊 VERIFICATION RESULTS");
  console.log("=".repeat(60));

  console.log(`\nTotal URLs tested: ${results.length}`);
  console.log(`✅ Successful (2xx): ${successful.length}`);
  console.log(`❌ Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log(`\nFailure Breakdown:`);
    if (notFound.length > 0) console.log(`   404 Not Found: ${notFound.length}`);
    if (serverErrors.length > 0) console.log(`   5xx Server Errors: ${serverErrors.length}`);
    if (timeouts.length > 0) console.log(`   Timeouts: ${timeouts.length}`);
    if (connectionErrors.length > 0)
      console.log(`   Connection Refused: ${connectionErrors.length}`);
  }

  console.log(`\nPerformance:`);
  console.log(`   Total time: ${(duration / 1000).toFixed(1)}s`);
  console.log(`   Avg response time: ${Math.round(avgResponseTime)}ms`);
  if (slowest) {
    console.log(`   Slowest: ${slowest.url} (${slowest.responseTime}ms)`);
  }

  // Show failed URLs
  if (notFound.length > 0) {
    console.log("\n🚨 404 NOT FOUND URLs:");
    notFound.forEach((r) => {
      console.log(`   ${r.url}`);
    });
  }

  if (serverErrors.length > 0) {
    console.log("\n🚨 SERVER ERROR URLs:");
    serverErrors.forEach((r) => {
      console.log(`   [${r.status}] ${r.url}`);
    });
  }

  // Exit with error code if any failures
  if (failed.length > 0) {
    console.log(`\n❌ VERIFICATION FAILED: ${failed.length} URLs are not accessible`);
    process.exit(1);
  } else {
    console.log(`\n✅ SUCCESS: All ${results.length} URLs are accessible!`);
    process.exit(0);
  }
}

// Run the verification
main().catch((error) => {
  console.error("\n🚨 Fatal error:", error);
  process.exit(1);
});
