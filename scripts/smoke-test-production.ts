#!/usr/bin/env bun
import type { SmokeTestEndpointOptions, TestResult } from "@/types/scripts";
import { bookmarkDiagnosticsResponseSchema, healthResponseSchema } from "@/types/schemas/api";
class ProductionSmokeTests {
  private baseUrl: string;
  private results: TestResult[] = [];
  private authToken?: string;
  constructor(baseUrl: string, authToken?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.authToken = authToken;
    console.log(`🔥 Running smoke tests against: ${this.baseUrl}`);
  }
  private async testEndpoint(
    name: string,
    path: string,
    options: SmokeTestEndpointOptions = {},
  ): Promise<TestResult> {
    const startTime = Date.now();
    const endpoint = `${this.baseUrl}${path}`;
    try {
      const headers = new Headers(options.headers);
      headers.set("User-Agent", "Smoke-Test/1.0");
      if (options.requiresAuth && this.authToken) {
        headers.set("Authorization", `Bearer ${this.authToken}`);
      }
      const method = options.method === undefined ? "GET" : options.method;
      const fetchOptions: RequestInit = {
        method,
        headers,
        signal: AbortSignal.timeout(10000),
      };
      if (method !== "GET" && options.body !== undefined) {
        fetchOptions.body = JSON.stringify(options.body);
      }
      const response = await fetch(endpoint, fetchOptions);
      const responseTime = Date.now() - startTime;
      const expectedStatus = options.expectedStatus === undefined ? 200 : options.expectedStatus;
      let passed = response.status === expectedStatus;
      if (passed && options.validateResponse) {
        passed = await options.validateResponse(response);
      } else if (passed && response.status === 200 && options.validateJson) {
        try {
          const data: unknown = await response.json();
          passed = options.validateJson(data);
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

    const paths = [
      ["Homepage", "/", 200],
      ["Bookmarks List", "/bookmarks", 200],
      [
        "Individual Bookmark",
        "/bookmarks/textual-textualize-io-blog-2024-12-12-algorithms-for-high-performance-terminal-apps",
        200,
      ],
      ["Blog", "/blog", 200],
      ["Projects", "/projects", 200],
      ["404 Error Page", "/this-page-should-not-exist-12345", 404],
      ["Removed Status Page", "/status", 404],
    ] as const;

    for (const [name, path, expectedStatus] of paths) {
      this.results.push(await this.testEndpoint(name, path, { expectedStatus }));
    }

    this.results.push(
      await this.testEndpoint("Investments content and scripts", "/investments", {
        validateResponse: async (response) => {
          const html = await response.text();
          const scripts = [
            ...new Set(
              [...html.matchAll(/src=["'](\/_next\/static\/[^"']+\.js[^"']*)["']/g)].flatMap(
                (match) => (match[1] ? [match[1]] : []),
              ),
            ),
          ];
          if (!html.includes("Investment Portfolio") || scripts.length === 0) return false;
          const responses = await Promise.all(
            scripts.map((script) =>
              fetch(this.baseUrl + script, {
                headers: { "User-Agent": "Smoke-Test/1.0" },
                signal: AbortSignal.timeout(10000),
              }),
            ),
          );
          return responses.every((script) => script.status === 200);
        },
      }),
    );
    this.results.push(
      await this.testEndpoint("Public HTML has no global CORS or client IP headers", "/", {
        validateResponse: async (response) =>
          response.headers.get("access-control-allow-origin") === null &&
          response.headers.get("x-real-ip") === null,
      }),
    );
    this.results.push(
      await this.testEndpoint("Public HTML rejects arbitrary-origin preflight", "/", {
        expectedStatus: 405,
        method: "OPTIONS",
        headers: {
          Origin: "https://untrusted.example",
          "Access-Control-Request-Method": "GET",
        },
        validateResponse: async (response) =>
          response.headers.get("access-control-allow-origin") === null,
      }),
    );
    const missingStaticChunk = "/_next/static/chunks/smoke-missing-" + crypto.randomUUID() + ".js";
    this.results.push(
      await this.testEndpoint("Missing static chunk is not edge-cached", missingStaticChunk, {
        expectedStatus: 404,
        validateResponse: async (response) => {
          const repeatedResponse = await fetch(this.baseUrl + missingStaticChunk, {
            headers: { "User-Agent": "Smoke-Test/1.0" },
            signal: AbortSignal.timeout(10000),
          });
          const hasExpectedHeaders = (candidate: Response): boolean => {
            const cacheControl = candidate.headers.get("cache-control")?.toLowerCase();
            return (
              candidate.status === 404 &&
              cacheControl?.includes("public") !== true &&
              ["cdn-cache-control", "cloudflare-cdn-cache-control"].every(
                (header) => !candidate.headers.has(header),
              )
            );
          };
          return (
            hasExpectedHeaders(response) &&
            hasExpectedHeaders(repeatedResponse) &&
            repeatedResponse.headers.get("cf-cache-status")?.toUpperCase().includes("HIT") !==
              true &&
            repeatedResponse.headers.get("age") === null
          );
        },
      }),
    );
  }

  async runAPITests(): Promise<void> {
    console.log("\n🔌 Testing API Endpoints...\n");

    this.results.push(
      await this.testEndpoint("Health Check API", "/api/health", {
        expectedStatus: 200,
        validateJson: (data) => healthResponseSchema.safeParse(data).success,
      }),
    );

    this.results.push(
      await this.testEndpoint("Protected Health Metrics API", "/api/health/metrics", {
        expectedStatus: this.authToken ? 200 : 401,
        requiresAuth: true,
        validateJson: (data) => healthResponseSchema.safeParse(data).success,
      }),
    );

    this.results.push(
      await this.testEndpoint("Bookmarks Diagnostics", "/api/bookmarks/diagnostics", {
        expectedStatus: this.authToken ? 200 : 401,
        requiresAuth: true,
        validateJson: (data) => {
          const parsed = bookmarkDiagnosticsResponseSchema.safeParse(data);
          return parsed.success && Object.values(parsed.data.checks).every(Boolean);
        },
      }),
    );

    for (const [name, path] of [
      ["Sitemap", "/sitemap.xml"],
      ["RSS Feed", "/feed.xml"],
      ["Robots.txt", "/robots.txt"],
    ] as const) {
      this.results.push(await this.testEndpoint(name, path));
    }
  }

  async runPerformanceTests(): Promise<void> {
    console.log("\n⚡ Testing Performance Thresholds...\n");

    for (const [name, path, threshold] of [
      ["Homepage Load Time", "/", 2000],
      ["API Response Time", "/api/health", 1000],
      ["Static Asset Load Time", "/favicon.ico", 500],
    ] as const) {
      const result = await this.testEndpoint(name, path);
      this.results.push({
        ...result,
        passed: result.passed && result.responseTime < threshold,
      });
    }
  }

  async runDataIntegrityTests(): Promise<void> {
    console.log("\n🔍 Testing Data Integrity...\n");

    const diagnosticsResult = await this.testEndpoint(
      "Bookmarks Data Integrity",
      "/api/bookmarks/diagnostics",
      {
        expectedStatus: this.authToken ? 200 : 401,
        requiresAuth: true,
        validateJson: (data) => {
          const parsed = bookmarkDiagnosticsResponseSchema.safeParse(data);
          if (!parsed.success) return false;
          if (!Object.values(parsed.data.checks).every(Boolean)) return false;
          const isCorrectEnv = this.baseUrl.includes("dev.")
            ? parsed.data.environment.resolved === "development"
            : parsed.data.environment.resolved === "production";
          return isCorrectEnv;
        },
      },
    );

    this.results.push({
      ...diagnosticsResult,
      name: "Bookmark Data Integrity",
    });

    const bookmarkSlugTest = await this.testEndpoint(
      "Bookmark Slug Resolution",
      "/bookmarks/test-slug-that-should-404",
      {
        expectedStatus: 200,
        validateResponse: async (response) => {
          if (response.headers.get("x-nextjs-postponed") !== "1") return false;
          const body = await response.text();
          return body.includes('<meta name="robots" content="noindex"/>');
        },
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

    console.log("\n✅ PASSED TESTS:");
    passed.forEach((test) => {
      console.log(`  ✓ ${test.name} (${test.responseTime}ms)`);
    });

    if (failed.length > 0) {
      console.log("\n❌ FAILED TESTS:");
      failed.forEach((test) => {
        console.log(`  ✗ ${test.name}`);
        console.log(`    Endpoint: ${test.endpoint}`);
        if (test.statusCode) console.log(`    Status: ${test.statusCode}`);
        if (test.error) console.log(`    Error: ${test.error}`);
        console.log(`    Response Time: ${test.responseTime}ms`);
      });
    }

    const avgResponseTime =
      this.results.reduce((sum, r) => sum + r.responseTime, 0) / this.results.length;
    const maxResponseTime = Math.max(...this.results.map((r) => r.responseTime));

    console.log("\n📈 PERFORMANCE METRICS:");
    console.log(`  Average Response Time: ${Math.round(avgResponseTime)}ms`);
    console.log(`  Max Response Time: ${maxResponseTime}ms`);
    console.log(`  Tests Passed: ${passed.length}/${this.results.length}`);

    console.log("\n" + "=".repeat(70));
    const allPassed = failed.length === 0;
    if (allPassed) {
      console.log("✅ ALL SMOKE TESTS PASSED - Deployment Successful!");
    } else {
      console.log(`⚠️  ${failed.length} TESTS FAILED - Investigation Required`);
    }
    console.log("=".repeat(70) + "\n");

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

if (!baseUrl.startsWith("http")) baseUrl = `https://${baseUrl}`;

const tester = new ProductionSmokeTests(baseUrl, authToken);
tester.run().catch((error) => {
  console.error("Smoke tests failed:", error);
  process.exit(1);
});
