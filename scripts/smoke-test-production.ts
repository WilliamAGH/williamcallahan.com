#!/usr/bin/env bun

/**
 * Production Smoke Test Suite
 *
 * Run this immediately after deployment to verify critical functionality
 * works in the production environment.
 */

import type { TestResult } from "@/types/scripts";

class ProductionSmokeTests {
  private baseUrl: string;
  private results: TestResult[] = [];
  private authToken?: string;

  constructor(baseUrl: string, authToken?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.authToken = authToken;
    console.log(`🔥 Running smoke tests against: ${this.baseUrl}`);
  }

  private async testEndpoint(
    name: string,
    path: string,
    options: {
      expectedStatus?: number;
      requiresAuth?: boolean;
      method?: string;
      body?: unknown;
      validateResponse?: (data: unknown) => boolean;
    } = {},
  ): Promise<TestResult> {
    const startTime = Date.now();
    const endpoint = `${this.baseUrl}${path}`;

    try {
      const headers: HeadersInit = {
        "User-Agent": "Smoke-Test/1.0",
      };

      if (options.requiresAuth && this.authToken) {
        headers.Authorization = `Bearer ${this.authToken}`;
      }

      const method = options.method || "GET";
      const fetchOptions: RequestInit = {
        method,
        headers,
        signal: AbortSignal.timeout(10000), // 10 second timeout
      };

      // Only add body for non-GET requests
      if (method !== "GET" && options.body) {
        fetchOptions.body = JSON.stringify(options.body);
      }

      const response = await fetch(endpoint, fetchOptions);

      const responseTime = Date.now() - startTime;
      const expectedStatus = options.expectedStatus || 200;

      let passed = response.status === expectedStatus;

      // Additional validation if provided (only validate JSON on 200 responses)
      if (passed && response.status === 200 && options.validateResponse) {
        try {
          const data = await response.json();
          passed = options.validateResponse(data);
        } catch {
          passed = false;
        }
      }

      return {
        name,
        endpoint,
        passed,
        responseTime,
        statusCode: response.status,
      };
    } catch (error: unknown) {
      return {
        name,
        endpoint,
        passed: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async runCriticalPathTests(): Promise<void> {
    console.log("\n📍 Testing Critical User Paths...\n");

    // 1. Homepage
    this.results.push(
      await this.testEndpoint("Homepage", "/", {
        expectedStatus: 200,
      }),
    );

    // 2. Bookmarks List
    this.results.push(
      await this.testEndpoint("Bookmarks List", "/bookmarks", {
        expectedStatus: 200,
      }),
    );

    // 3. Individual Bookmark (requires knowing a slug)
    this.results.push(
      await this.testEndpoint(
        "Individual Bookmark",
        "/bookmarks/textual-textualize-io-blog-2024-12-12-algorithms-for-high-performance-terminal-apps",
        {
          expectedStatus: 200,
        },
      ),
    );

    // 4. Blog
    this.results.push(
      await this.testEndpoint("Blog", "/blog", {
        expectedStatus: 200,
      }),
    );

    // 5. Projects
    this.results.push(
      await this.testEndpoint("Projects", "/projects", {
        expectedStatus: 200,
      }),
    );

    // 6. 404 Page
    this.results.push(
      await this.testEndpoint("404 Error Page", "/this-page-should-not-exist-12345", {
        expectedStatus: 404,
      }),
    );
  }

  async runAPITests(): Promise<void> {
    console.log("\n🔌 Testing API Endpoints...\n");

    // 1. Health Check
    this.results.push(
      await this.testEndpoint("Health Check API", "/api/health", {
        expectedStatus: 200,
        validateResponse: (data: unknown) => {
          if (!data || typeof data !== "object") return false;
          const status = (data as { status?: unknown }).status;
          return status === "healthy";
        },
      }),
    );

    // 2. Bookmarks Diagnostics (may require auth in production)
    this.results.push(
      await this.testEndpoint("Bookmarks Diagnostics", "/api/bookmarks/diagnostics", {
        expectedStatus: this.authToken ? 200 : 401,
        requiresAuth: true,
        validateResponse: (data: unknown) => {
          if (!data || typeof data !== "object") return false;
          const checks = (
            data as { checks?: { datasetOk?: unknown; indexOk?: unknown; slugMapOk?: unknown } }
          ).checks;
          if (!checks || typeof checks !== "object") return false;
          const datasetOk = (checks as Record<string, unknown>).datasetOk === true;
          const indexOk = (checks as Record<string, unknown>).indexOk === true;
          const slugMapOk = (checks as Record<string, unknown>).slugMapOk === true;
          // Check for critical S3 data
          return datasetOk && indexOk && slugMapOk;
        },
      }),
    );

    // 3. Sitemap
    this.results.push(
      await this.testEndpoint("Sitemap", "/sitemap.xml", {
        expectedStatus: 200,
      }),
    );

    // 4. RSS Feed
    this.results.push(
      await this.testEndpoint("RSS Feed", "/feed.xml", {
        expectedStatus: 200,
      }),
    );

    // 5. Robots.txt
    this.results.push(
      await this.testEndpoint("Robots.txt", "/robots.txt", {
        expectedStatus: 200,
      }),
    );
  }

  async runPerformanceTests(): Promise<void> {
    console.log("\n⚡ Testing Performance Thresholds...\n");

    const performanceThresholds = {
      homepage: 2000, // 2 seconds
      api: 1000, // 1 second
      static: 500, // 500ms
    };

    // Test homepage load time
    const homepageResult = await this.testEndpoint("Homepage Performance", "/", {
      expectedStatus: 200,
    });

    this.results.push({
      ...homepageResult,
      name: "Homepage Load Time",
      passed: homepageResult.passed && homepageResult.responseTime < performanceThresholds.homepage,
    });

    // Test API response time
    const apiResult = await this.testEndpoint("API Performance", "/api/health", {
      expectedStatus: 200,
    });

    this.results.push({
      ...apiResult,
      name: "API Response Time",
      passed: apiResult.passed && apiResult.responseTime < performanceThresholds.api,
    });

    // Test static asset
    const staticResult = await this.testEndpoint("Static Asset", "/favicon.ico", {
      expectedStatus: 200,
    });

    this.results.push({
      ...staticResult,
      name: "Static Asset Load Time",
      passed: staticResult.passed && staticResult.responseTime < performanceThresholds.static,
    });
  }

  async runDataIntegrityTests(): Promise<void> {
    console.log("\n🔍 Testing Data Integrity...\n");

    // Check if bookmarks data is accessible and valid
    const diagnosticsResult = await this.testEndpoint(
      "Bookmarks Data Integrity",
      "/api/bookmarks/diagnostics",
      {
        expectedStatus: this.authToken ? 200 : 401,
        requiresAuth: true,
        validateResponse: (data: unknown) => {
          if (!data || typeof data !== "object") return false;
          const obj = data as {
            checks?: {
              datasetOk?: unknown;
              indexOk?: unknown;
              firstPageOk?: unknown;
              slugMapOk?: unknown;
            };
            environment?: { resolved?: unknown };
          };
          if (!obj.checks) return false;

          // All critical data should be present
          const allChecksPass =
            obj.checks?.datasetOk === true &&
            obj.checks?.indexOk === true &&
            obj.checks?.firstPageOk === true &&
            obj.checks?.slugMapOk === true;

          // Environment should match production
          const isCorrectEnv = this.baseUrl.includes("dev.")
            ? obj.environment?.resolved === "development"
            : obj.environment?.resolved === "production";

          return allChecksPass && isCorrectEnv;
        },
      },
    );

    this.results.push({
      ...diagnosticsResult,
      name: "S3 Data Integrity",
    });

    // Test that bookmark slugs resolve
    const bookmarkSlugTest = await this.testEndpoint(
      "Bookmark Slug Resolution",
      "/bookmarks/test-slug-that-should-404",
      {
        expectedStatus: 404, // Should return 404 for non-existent slug
      },
    );

    this.results.push({
      ...bookmarkSlugTest,
      name: "Bookmark 404 Handling",
    });
  }

  generateReport(): void {
    console.log("\n" + "=".repeat(70));
    console.log("📊 SMOKE TEST RESULTS");
    console.log("=".repeat(70));
    console.log(`Environment: ${this.baseUrl}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log("-".repeat(70));

    const passed = this.results.filter((r) => r.passed);
    const failed = this.results.filter((r) => !r.passed);

    // Group results by status
    console.log("\n✅ PASSED TESTS:");
    passed.forEach((test) => {
      console.log(`  ✓ ${test.name} (${test.responseTime}ms)`);
    });

    if (failed.length > 0) {
      console.log("\n❌ FAILED TESTS:");
      failed.forEach((test) => {
        console.log(`  ✗ ${test.name}`);
        console.log(`    Endpoint: ${test.endpoint}`);
        if (test.statusCode) {
          console.log(`    Status: ${test.statusCode}`);
        }
        if (test.error) {
          console.log(`    Error: ${test.error}`);
        }
        console.log(`    Response Time: ${test.responseTime}ms`);
      });
    }

    // Performance summary
    const avgResponseTime =
      this.results.reduce((sum, r) => sum + r.responseTime, 0) / this.results.length;
    const maxResponseTime = Math.max(...this.results.map((r) => r.responseTime));

    console.log("\n📈 PERFORMANCE METRICS:");
    console.log(`  Average Response Time: ${Math.round(avgResponseTime)}ms`);
    console.log(`  Max Response Time: ${maxResponseTime}ms`);
    console.log(`  Tests Passed: ${passed.length}/${this.results.length}`);

    // Final verdict
    console.log("\n" + "=".repeat(70));
    const allPassed = failed.length === 0;
    if (allPassed) {
      console.log("✅ ALL SMOKE TESTS PASSED - Deployment Successful!");
    } else {
      console.log(`⚠️  ${failed.length} TESTS FAILED - Investigation Required`);
      console.log("\nRecommended Actions:");
      console.log("1. Check server logs for errors");
      console.log("2. Verify environment variables are set correctly");
      console.log("3. Ensure S3 data is accessible from production");
      console.log("4. Check that all services are running");
    }
    console.log("=".repeat(70) + "\n");

    // Exit with appropriate code
    process.exit(allPassed ? 0 : 1);
  }

  async run(): Promise<void> {
    console.log("🚀 Starting Production Smoke Tests...");
    console.log(`Target: ${this.baseUrl}\n`);

    await this.runCriticalPathTests();
    await this.runAPITests();
    await this.runPerformanceTests();
    await this.runDataIntegrityTests();

    this.generateReport();
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
let baseUrl = args[0];
const authToken = args[1];

if (!baseUrl) {
  console.error("Usage: bun scripts/smoke-test-production.ts <base-url> [auth-token]");
  console.error(
    "Example: bun scripts/smoke-test-production.ts https://williamcallahan.com your-secret-token",
  );
  process.exit(1);
}

// Add https:// if not present
if (!baseUrl.startsWith("http")) {
  baseUrl = `https://${baseUrl}`;
}

// Run smoke tests
const tester = new ProductionSmokeTests(baseUrl, authToken);
tester.run().catch((error) => {
  console.error("Smoke tests failed:", error);
  process.exit(1);
});
