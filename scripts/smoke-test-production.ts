#!/usr/bin/env bun
import type { SmokeTestEndpointOptions, TestResult } from "@/types/scripts";
import { BLOG_RENDER_CANARIES } from "@/config/blog-render-canaries";
import { bookmarkDiagnosticsResponseSchema, healthResponseSchema } from "@/types/schemas/api";
import { validateBlogRenderHtml } from "./blog-render-smoke";
const CONVERGENCE_SAMPLE_COUNT = 5;
const EXPECTED_RELEASE_ID_PREFIX = "--expected-release-id=";
export function fetchStaticScript(
  url: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<Response> {
  return fetchImplementation(url, {
    headers: { "User-Agent": "Smoke-Test/1.0" },
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
}
export async function validateAdvertisedJavaScript(
  responses: readonly Response[],
  baseUrl: string,
  expectedReleaseId: string | undefined,
  fetchAsset: (url: string) => Promise<Response>,
): Promise<boolean> {
  const samples = await Promise.all(
    responses.map(async (response) => ({ html: await response.text(), status: response.status })),
  );
  const samplePaths = samples.map((sample) =>
    [...sample.html.matchAll(/src=["'](\/_next\/static\/[^"']+\.js[^"']*)["']/g)].flatMap((match) =>
      match[1] === undefined ? [] : [match[1]],
    ),
  );
  const scripts = [...new Set(samplePaths.flat())].map((path) => new URL(path, baseUrl));
  const deploymentIds = new Set(scripts.map((script) => script.searchParams.get("dpl")));
  if (
    !samples.every(
      (sample) => sample.status === 200 && sample.html.includes("Investment Portfolio"),
    ) ||
    samplePaths.some((paths) => paths.length === 0) ||
    deploymentIds.size !== 1 ||
    ![...deploymentIds].every(Boolean) ||
    (expectedReleaseId !== undefined && !deploymentIds.has(expectedReleaseId))
  ) {
    return false;
  }
  const assetChecks = await Promise.all(
    scripts.map(async (script) => {
      const response = await fetchAsset(script.href);
      const body = await response.text();
      const contentType = response.headers
        .get("content-type")
        ?.split(";", 1)[0]
        ?.trim()
        .toLowerCase();
      return (
        response.status === 200 &&
        response.url === script.href &&
        body.length > 0 &&
        (contentType === "application/javascript" || contentType === "text/javascript")
      );
    }),
  );
  return assetChecks.every(Boolean);
}
class ProductionSmokeTests {
  private results: TestResult[] = [];
  constructor(
    private baseUrl: string,
    private authToken?: string,
    private expectedReleaseId?: string,
  ) {
    this.baseUrl = this.baseUrl.replace(/\/$/, "");
    console.log(`🔥 Running smoke tests against: ${this.baseUrl}`);
  }
  private fetchSameOrigin(path: string): Promise<Response> {
    return fetch(this.baseUrl + path, {
      headers: { "User-Agent": "Smoke-Test/1.0" },
      signal: AbortSignal.timeout(10000),
    });
  }

  private async hasNoStoreRepeat(
    path: string,
    response: Response,
    expectedStatus: number,
  ): Promise<boolean> {
    return [response, await this.fetchSameOrigin(path)].every((candidate) => {
      const cacheControl = candidate.headers.get("cache-control")?.toLowerCase();
      return (
        candidate.status === expectedStatus &&
        cacheControl?.includes("no-store") === true &&
        ["cdn-cache-control", "cloudflare-cdn-cache-control"].every(
          (header) => candidate.headers.get(header)?.toLowerCase().includes("no-store") !== false,
        ) &&
        candidate.headers.get("cf-cache-status")?.toUpperCase().includes("HIT") !== true &&
        candidate.headers.get("age") === null
      );
    });
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

  private async record(
    name: string,
    path: string,
    options: SmokeTestEndpointOptions = {},
  ): Promise<void> {
    return this.testEndpoint(name, path, options).then((result) => void this.results.push(result));
  }

  async runCriticalPathTests(): Promise<void> {
    for (const [name, path, expectedStatus] of [
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
    ] as const) {
      await this.record(name, path, { expectedStatus });
    }
    for (const canary of BLOG_RENDER_CANARIES)
      await this.record(`Blog article render: ${canary.slug}`, `/blog/${canary.slug}`, {
        validateResponse: async (response) => validateBlogRenderHtml(await response.text(), canary),
      });
    await this.record("Investment release identity and scripts converge", "/investments", {
      validateResponse: async (response) => {
        const responses = [
          response,
          ...(await Promise.all(
            Array.from({ length: CONVERGENCE_SAMPLE_COUNT - 1 }, () =>
              this.fetchSameOrigin("/investments"),
            ),
          )),
        ];
        return validateAdvertisedJavaScript(
          responses,
          this.baseUrl,
          this.expectedReleaseId,
          fetchStaticScript,
        );
      },
    });
    await this.record("Public HTML has no global CORS or client IP headers", "/", {
      validateResponse: async (response) =>
        response.headers.get("access-control-allow-origin") === null &&
        response.headers.get("x-real-ip") === null,
    });
    await this.record("Public HTML rejects arbitrary-origin preflight", "/", {
      expectedStatus: 405,
      method: "OPTIONS",
      headers: { Origin: "https://untrusted.example", "Access-Control-Request-Method": "GET" },
      validateResponse: async (response) =>
        response.headers.get("access-control-allow-origin") === null,
    });
    for (const [name, path, expectedStatus] of [
      [
        "Missing static chunk is not edge-cached",
        `/_next/static/chunks/smoke-missing-${crypto.randomUUID()}.js`,
        404,
      ],
      ["Analytics script is not edge-cached", `/stats/script.js?smoke=${crypto.randomUUID()}`, 200],
    ] as const) {
      await this.record(name, path, {
        expectedStatus,
        validateResponse: (response) => this.hasNoStoreRepeat(path, response, expectedStatus),
      });
    }
  }

  async runAPITests(): Promise<void> {
    await this.record("Health Check API", "/api/health", {
      expectedStatus: 200,
      validateJson: (data) => healthResponseSchema.safeParse(data).success,
    });
    await this.record("Protected Health Metrics API", "/api/health/metrics", {
      expectedStatus: this.authToken ? 200 : 401,
      requiresAuth: true,
      validateJson: (data) => healthResponseSchema.safeParse(data).success,
    });
    await this.record("Bookmarks Diagnostics", "/api/bookmarks/diagnostics", {
      expectedStatus: this.authToken ? 200 : 401,
      requiresAuth: true,
      validateJson: (data) => {
        const parsed = bookmarkDiagnosticsResponseSchema.safeParse(data);
        return parsed.success && Object.values(parsed.data.checks).every(Boolean);
      },
    });

    for (const [name, path] of [
      ["Sitemap", "/sitemap.xml"],
      ["RSS Feed", "/feed.xml"],
      ["Robots.txt", "/robots.txt"],
    ] as const) {
      await this.record(name, path);
    }
  }

  private async recordDataIntegrity(): Promise<void> {
    await this.record("Bookmark Data Integrity", "/api/bookmarks/diagnostics", {
      expectedStatus: this.authToken ? 200 : 401,
      requiresAuth: true,
      validateJson: (data) => {
        const parsed = bookmarkDiagnosticsResponseSchema.safeParse(data);
        return (
          parsed.success &&
          Object.values(parsed.data.checks).every(Boolean) &&
          (this.baseUrl.includes("dev.")
            ? parsed.data.environment.resolved === "development"
            : parsed.data.environment.resolved === "production")
        );
      },
    });
    await this.record("Bookmark 404 Handling", "/bookmarks/test-slug-that-should-404", {
      expectedStatus: 200,
      validateResponse: async (response) => {
        const body = await response.text();
        return (
          response.headers.get("x-nextjs-postponed") === "1" &&
          body.includes('<meta name="robots" content="noindex"/>')
        );
      },
    });
  }

  generateReport(): void {
    const passed = this.results.filter((r) => r.passed);
    const failed = this.results.filter((r) => !r.passed);
    const allPassed = failed.length === 0;
    console.log(`\n📊 ${passed.length}/${this.results.length} checks passed for ${this.baseUrl}`);
    for (const test of this.results)
      console.log(`  ${test.passed ? "✓" : "✗"} ${test.name} (${test.responseTime}ms)`);
    for (const test of failed) {
      console.log(`    Endpoint: ${test.endpoint}`);
      if (test.statusCode !== undefined) console.log(`    Status: ${test.statusCode}`);
      if (test.error !== undefined) console.log(`    Error: ${test.error}`);
    }
    console.log(allPassed ? "✅ ALL SMOKE CHECKS PASSED" : `⚠️ ${failed.length} CHECKS FAILED`);
    process.exit(allPassed ? 0 : 1);
  }

  async run(): Promise<void> {
    console.log(`🚀 Starting production smoke checks against ${this.baseUrl}`);
    await this.runCriticalPathTests();
    await this.runAPITests();
    for (const [name, path, threshold] of [
      ["Homepage Load Time", "/", 2000],
      ["API Response Time", "/api/health", 1000],
      ["Static Asset Load Time", "/favicon.ico", 500],
    ] as const) {
      const result = await this.testEndpoint(name, path);
      this.results.push({ ...result, passed: result.passed && result.responseTime < threshold });
    }
    await this.recordDataIntegrity();
    this.generateReport();
  }
}

export function parseSmokeTestArguments(args: string[]) {
  const releaseArguments = args.filter((argument) =>
    argument.startsWith(EXPECTED_RELEASE_ID_PREFIX),
  );
  const positionalArguments = args.filter((argument) => !releaseArguments.includes(argument));
  if (
    releaseArguments.length > 1 ||
    releaseArguments[0] === EXPECTED_RELEASE_ID_PREFIX ||
    positionalArguments.length === 0 ||
    positionalArguments.length > 2
  )
    return undefined;
  const [baseUrl, authToken] = positionalArguments;
  if (baseUrl === undefined) return undefined;
  return {
    authToken,
    baseUrl: baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`,
    expectedReleaseId: releaseArguments[0]?.slice(EXPECTED_RELEASE_ID_PREFIX.length),
  };
}

if (import.meta.main) {
  const options = parseSmokeTestArguments(process.argv.slice(2));
  if (options === undefined) {
    console.error(
      "Usage: bun scripts/smoke-test-production.ts <base-url> [auth-token] [--expected-release-id=<id>]",
    );
    process.exit(1);
  }
  new ProductionSmokeTests(options.baseUrl, options.authToken, options.expectedReleaseId)
    .run()
    .catch((error: unknown) => {
      console.error("Smoke tests failed:", error);
      process.exit(1);
    });
}
