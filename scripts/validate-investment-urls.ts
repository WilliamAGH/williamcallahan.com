#!/usr/bin/env bun

/**
 * Validate Investment URLs
 *
 * Comprehensive URL validation for investment data using multiple techniques:
 * - URL constructor validation
 * - HTTP response testing
 * - Domain format analysis
 * - SSL certificate validation
 */

import { investments } from "../data/investments";
import type { Investment } from "../types/investment";
import type { InvestmentUrlValidationResult } from "@/types/investment";

/**
 * Validate URL format using URL constructor (from web search results)
 */
function isValidHttpUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Normalize URL for testing
 */
function normalizeUrl(url: string): string {
  // Check if URL already contains a protocol pattern
  if (url.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//)) {
    return url; // Already has a protocol
  }
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return `https://${url}`;
  }
  return url;
}

/**
 * Test URL reachability with timeout
 */
async function testUrlReachability(url: string): Promise<{
  isReachable: boolean;
  status?: number;
  responseTime?: number;
  errorType?: string;
  redirectUrl?: string;
  hasSSL?: boolean;
}> {
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(url, {
      method: "HEAD", // Use HEAD to avoid downloading full response
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; URL-Validator/1.0)",
      },
    });

    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;

    return {
      isReachable: response.ok || (response.status >= 300 && response.status < 400),
      status: response.status,
      responseTime,
      redirectUrl: response.url !== url ? response.url : undefined,
      hasSSL: response.url.startsWith("https://"),
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    let errorType = "Unknown error";

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        errorType = "Timeout";
      } else if (error.message.includes("ENOTFOUND")) {
        errorType = "DNS resolution failed";
      } else if (error.message.includes("ECONNREFUSED")) {
        errorType = "Connection refused";
      } else if (error.message.includes("certificate")) {
        errorType = "SSL certificate error";
      } else {
        errorType = error.message;
      }
    }

    return {
      isReachable: false,
      responseTime,
      errorType,
    };
  }
}

/**
 * Validate a single investment URL
 */
async function validateInvestmentUrl(investment: Investment): Promise<InvestmentUrlValidationResult> {
  const website = investment.website;

  if (!website) {
    return {
      investment,
      url: "",
      isValidFormat: false,
      isReachable: false,
      errorType: "No website provided",
    };
  }

  const normalizedUrl = normalizeUrl(website);
  const isValidFormat = isValidHttpUrl(normalizedUrl);

  if (!isValidFormat) {
    return {
      investment,
      url: normalizedUrl,
      isValidFormat: false,
      isReachable: false,
      errorType: "Invalid URL format",
    };
  }

  console.log(`Testing: ${investment.name} - ${normalizedUrl}`);

  const reachabilityResult = await testUrlReachability(normalizedUrl);

  return {
    investment,
    url: normalizedUrl,
    isValidFormat: true,
    isReachable: reachabilityResult.isReachable,
    httpStatus: reachabilityResult.status,
    responseTime: reachabilityResult.responseTime,
    errorType: reachabilityResult.errorType,
    redirectUrl: reachabilityResult.redirectUrl,
    hasSSL: reachabilityResult.hasSSL,
  };
}

/**
 * Check if investment is active (not defunct)
 */
function isActiveInvestment(investment: Investment): boolean {
  return !(
    investment.status === "Realized" ||
    investment.operating_status === "Shut Down" ||
    investment.operating_status === "Inactive" ||
    investment.shutdown_year !== null ||
    investment.acquired_year !== null
  );
}

/**
 * Process investments in batches with concurrency control
 */
async function processBatch(
  investments: Investment[],
  concurrencyLimit: number,
): Promise<InvestmentUrlValidationResult[]> {
  const results: InvestmentUrlValidationResult[] = [];
  const queue = [...investments];
  const activePromises = new Set<Promise<void>>();

  while (queue.length > 0 || activePromises.size > 0) {
    // Start new tasks up to concurrency limit
    while (queue.length > 0 && activePromises.size < concurrencyLimit) {
      const investment = queue.shift();
      if (!investment) break;

      const promise = validateInvestmentUrl(investment)
        .then((result) => {
          results.push(result);
          console.log(`Tested ${results.length}/${investments.length}: ${investment.name}`);
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

async function validateAllUrls() {
  console.log("🔍 Validating Investment URLs\n");

  const activeInvestments = investments.filter(isActiveInvestment);
  console.log(`Testing ${activeInvestments.length} active investments...\n`);

  // Use limited concurrency to be polite to servers
  const CONCURRENCY_LIMIT = 5;
  console.log(`Using concurrency limit of ${CONCURRENCY_LIMIT}\n`);

  const startTime = Date.now();
  const results = await processBatch(activeInvestments, CONCURRENCY_LIMIT);
  const duration = Date.now() - startTime;

  console.log(`\n✅ Completed all tests in ${(duration / 1000).toFixed(1)} seconds`);

  console.log("\n📊 URL Validation Results\n");

  // Summary statistics
  const validFormat = results.filter((r) => r.isValidFormat).length;
  const reachable = results.filter((r) => r.isReachable).length;
  const unreachable = results.filter((r) => !r.isReachable && r.isValidFormat).length;
  const invalidFormat = results.filter((r) => !r.isValidFormat).length;

  console.log(`Total tested: ${results.length}`);
  console.log(`Valid format: ${validFormat}`);
  console.log(`Reachable: ${reachable}`);
  console.log(`Unreachable: ${unreachable}`);
  console.log(`Invalid format: ${invalidFormat}\n`);

  // Bad URLs (invalid format or unreachable)
  const badUrls = results.filter((r) => !r.isValidFormat || !r.isReachable);

  if (badUrls.length > 0) {
    console.log("❌ Problematic URLs:\n");

    for (const result of badUrls) {
      console.log(`${result.investment.name}:`);
      console.log(`  URL: ${result.url || "N/A"}`);
      console.log(`  Issue: ${result.errorType || "Unreachable"}`);
      if (result.httpStatus) {
        console.log(`  Status: ${result.httpStatus}`);
      }
      if (result.responseTime) {
        console.log(`  Response time: ${result.responseTime}ms`);
      }
      console.log();
    }
  }

  // URLs with redirects
  const redirects = results.filter((r) => r.redirectUrl);
  if (redirects.length > 0) {
    console.log("🔄 URLs with redirects:\n");
    for (const result of redirects) {
      console.log(`${result.investment.name}:`);
      console.log(`  Original: ${result.url}`);
      console.log(`  Redirects to: ${result.redirectUrl}`);
      console.log();
    }
  }

  // SSL status
  const noSSL = results.filter((r) => r.isReachable && !r.hasSSL);
  if (noSSL.length > 0) {
    console.log("🔓 URLs without SSL (HTTP only):\n");
    for (const result of noSSL) {
      console.log(`  • ${result.investment.name} - ${result.url}`);
    }
    console.log();
  }

  // Slow responses
  const slowResponses = results.filter((r) => r.responseTime && r.responseTime > 5000);
  if (slowResponses.length > 0) {
    console.log("🐌 Slow responses (>5s):\n");
    for (const result of slowResponses) {
      console.log(`  • ${result.investment.name} - ${result.responseTime}ms`);
    }
    console.log();
  }

  // Error breakdown
  console.log("📈 Error breakdown:\n");
  const errorTypes: { [key: string]: number } = {};
  for (const result of badUrls) {
    const error = result.errorType || "Unknown";
    errorTypes[error] = (errorTypes[error] || 0) + 1;
  }

  for (const [error, count] of Object.entries(errorTypes)) {
    console.log(`  ${error}: ${count}`);
  }
}

validateAllUrls().catch(console.error);
