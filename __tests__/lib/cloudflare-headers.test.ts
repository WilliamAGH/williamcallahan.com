// @vitest-environment node
import { execFileSync } from "node:child_process";
import { requireCloudflareHeaders } from "@/lib/utils/api-utils";
import { getClientIp, validateCloudflareHeaders } from "@/lib/utils/request-utils";
import { GET as getIp } from "@/app/api/ip/route";
import { UMAMI_ORIGIN } from "@/config/csp";
import { config as proxyConfig, proxy } from "@/proxy";
import {
  fetchStaticScript,
  parseSmokeTestArguments,
  validateAdvertisedJavaScript,
} from "../../scripts/smoke-test-production";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } from "next/constants";
import { NextRequest, NextResponse } from "next/server";

const originalRewrite = Object.getOwnPropertyDescriptor(NextResponse, "rewrite");
const clearDeploymentId = () => Reflect.deleteProperty(process.env, "NEXT_DEPLOYMENT_ID");
const createRewriteResponse: typeof NextResponse.rewrite = (destination, init) => {
  const response = NextResponse.next(init);
  response.headers.set("x-middleware-rewrite", destination.toString());
  return response;
};
function createProxyRequest(url: string, method: "GET" | "POST"): NextRequest {
  const request = new NextRequest(url, { method });
  Object.defineProperty(request, "nextUrl", { value: new URL(url) });
  Object.defineProperty(request, "signal", { value: new AbortController().signal });
  return request;
}
async function loadNextConfig(phase = PHASE_PRODUCTION_BUILD) {
  vi.resetModules();
  vi.doMock("@sentry/nextjs", () => ({
    withSentryConfig: <T>(nextConfig: T): T => nextConfig,
  }));
  const configPath = "../../next.config";
  const configModule = await import(configPath);
  return configModule.default(phase);
}
function responseAt(url: string, body: string, contentType: string): Response {
  const response = new Response(body, { headers: { "content-type": contentType } });
  Object.defineProperty(response, "url", { value: url });
  return response;
}
function investmentResponses(releaseId: string): Response[] {
  const html = `<h1>Investment Portfolio</h1><script src="/_next/static/chunks/app.js?dpl=${releaseId}"></script>`;
  return Array.from({ length: 5 }, () => new Response(html));
}
describe("Cloudflare header enforcement", () => {
  const ORIGINAL_ENV = { ...process.env };
  beforeEach(() => {
    vi.unstubAllEnvs();
    process.env = { ...ORIGINAL_ENV };
    Object.defineProperty(NextResponse, "rewrite", {
      configurable: true,
      value: createRewriteResponse,
    });
  });

  afterEach(() => {
    if (originalRewrite) Object.defineProperty(NextResponse, "rewrite", originalRewrite);
    else if (!Reflect.deleteProperty(NextResponse, "rewrite")) {
      throw new Error("Could not remove NextResponse.rewrite test implementation");
    }
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    process.env = { ...ORIGINAL_ENV };
  });
  it("validates when cf-ray and cf-connecting-ip are present", () => {
    const headers = new Headers({
      "cf-ray": "1234abcd",
      "cf-connecting-ip": "203.0.113.5",
      "x-forwarded-for": "173.245.48.1",
    });
    const validation = validateCloudflareHeaders(headers);
    expect(validation.isValid).toBe(true);
    expect(validation.reasons).toEqual([]);
  });
  it("prefers and normalizes the Cloudflare connecting IP", () => {
    const headers = new Headers({
      "cf-connecting-ip": "203.0.113.5, 10.0.0.1",
      "true-client-ip": "198.51.100.2",
      "x-forwarded-for": "192.0.2.3, 173.245.48.1",
    });
    expect(getClientIp(headers)).toBe("203.0.113.5");
  });
  it("recognizes Cloudflare IPv6 peers", () => {
    const headers = new Headers({
      "cf-ray": "1234abcd",
      "cf-connecting-ip": "2001:db8::5",
      "x-forwarded-for": "2606:4700::1",
    });
    expect(getClientIp(headers)).toBe("2001:db8::5");
    expect(validateCloudflareHeaders(headers).isValid).toBe(true);
  });
  it.each([
    ["173.245.63.255", true],
    ["173.245.64.0", false],
    ["2a06:98c7:ffff:ffff:ffff:ffff:ffff:ffff", true],
    ["2a06:98c8::1", false],
  ])("applies Cloudflare subnet boundaries for %s", (peerIp, isTrusted) => {
    const headers = new Headers({
      "cf-ray": "1234abcd",
      "cf-connecting-ip": "203.0.113.5",
      "x-forwarded-for": peerIp,
    });
    expect(validateCloudflareHeaders(headers).isValid).toBe(isTrusted);
    expect(getClientIp(headers)).toBe(isTrusted ? "203.0.113.5" : peerIp);
  });
  it("uses the direct peer instead of forged Cloudflare headers", () => {
    const headers = new Headers({
      "cf-ray": "forged",
      "cf-connecting-ip": "203.0.113.5",
      "true-client-ip": "198.51.100.2",
      "x-forwarded-for": "192.0.2.3, 99.9.208.198",
    });
    expect(getClientIp(headers)).toBe("99.9.208.198");
    expect(validateCloudflareHeaders(headers).reasons).toContain("untrusted_proxy");
  });
  it.each([
    [{ "cf-connecting-ip": "203.0.113.5", "x-forwarded-for": "173.245.48.1" }, "missing_cf_ray"],
    [
      { "cf-ray": "1234abcd", "cf-connecting-ip": "not-an-ip", "x-forwarded-for": "173.245.48.1" },
      "invalid_cf_ip",
    ],
  ])("flags invalid Cloudflare headers: %s", (input, reason) => {
    const headers = new Headers(input);
    const validation = validateCloudflareHeaders(headers);
    expect(validation.isValid).toBe(false);
    expect(validation.reasons).toContain(reason);
  });
  it("skips enforcement outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEPLOYMENT_ENV", "development");
    vi.stubEnv("API_BASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    const headers = new Headers();
    const response = requireCloudflareHeaders(headers, { route: "/api/ai/token" });
    expect(response).toBeNull();
  });
  it("blocks when headers are missing in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.API_BASE_URL = "https://williamcallahan.com";
    const headers = new Headers();
    const response = requireCloudflareHeaders(headers, { route: "/api/ai/token" });
    expect(response?.status).toBe(403);
  });
  it("allows direct-origin IP responses without Cloudflare headers", async () => {
    const request = new NextRequest("https://origin.example/api/ip", {
      headers: { "x-forwarded-for": "99.9.208.198" },
    });
    const response = await getIp(request);
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("99.9.208.198");
  });
  it.each([
    ["/stats/script.js", true],
    ["/api/send", true],
    ["/_next/static/chunks/app.js", false],
  ])("matches %s for same-origin Umami delivery", (path, shouldMatch) => {
    expect(
      unstable_doesMiddlewareMatch({
        config: proxyConfig,
        url: `https://williamcallahan.com${path}`,
      }),
    ).toBe(shouldMatch);
  });
  it("keeps analytics event ingestion on the exact upstream rewrite", async () => {
    const response = await proxy(
      createProxyRequest("https://williamcallahan.com/api/send?event=pageview", "POST"),
    );
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      `${UMAMI_ORIGIN}/api/send?event=pageview`,
    );
  });
  describe("next.config release identity", () => {
    afterEach(() => {
      for (const id of ["@sentry/nextjs", "node:child_process", "node:fs"]) vi.doUnmock(id);
      vi.resetModules();
    });
    it("delegates development build identity to Next", async () => {
      clearDeploymentId();
      vi.stubEnv("NODE_ENV", "development");
      await expect(loadNextConfig().then((config) => config.generateBuildId())).resolves.toBeNull();
    });
    it("preserves an explicit S3 endpoint protocol and port in image patterns", async () => {
      clearDeploymentId();
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("S3_BUCKET", "media-bucket");
      vi.stubEnv("S3_SERVER_URL", "http://localhost:9000");

      const nextConfig = await loadNextConfig();

      expect(nextConfig.images.remotePatterns).toContainEqual({
        protocol: "http",
        hostname: "media-bucket.localhost",
        port: "9000",
        pathname: "/**",
      });
    });
    it("uses a URL-safe production deployment ID as the release identity", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_DEPLOYMENT_ID", "release_2026-07-13");
      const nextConfig = await loadNextConfig();
      await expect(nextConfig.generateBuildId()).resolves.toBe("release_2026-07-13");
      expect(process.env.NEXT_PUBLIC_GIT_HASH).toBe("release_2026-07-13");
      expect(process.env.SENTRY_RELEASE).toBe("release_2026-07-13");
    });
    it("rejects a production deployment ID that is not URL-safe", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_DEPLOYMENT_ID", "release/id");
      await expect(loadNextConfig()).rejects.toThrow(
        "[next.config] NEXT_DEPLOYMENT_ID may contain only letters, numbers, hyphens, and underscores.",
      );
    });
    it("uses local Git or the built identity when the deployment ID is missing", async () => {
      clearDeploymentId();
      vi.stubEnv("NODE_ENV", "production");
      const expectedReleaseId = execFileSync("git", ["rev-parse", "--short", "HEAD"])
        .toString()
        .trim();
      const nextConfig = await loadNextConfig();
      await expect(nextConfig.generateBuildId()).resolves.toBe(expectedReleaseId);
      expect(process.env.NEXT_DEPLOYMENT_ID).toBe(expectedReleaseId);
      vi.doMock("node:child_process", () => ({ execFileSync: () => execFileSync("git-missing") }));
      vi.doMock("node:fs", () => ({ readFileSync: () => `${expectedReleaseId}\n` }));
      clearDeploymentId();
      const runtimeConfig = await loadNextConfig(PHASE_PRODUCTION_SERVER);
      await expect(runtimeConfig.generateBuildId()).resolves.toBe(expectedReleaseId);
    });
    it("keeps production builds fail-closed without an explicit or Git identity", async () => {
      clearDeploymentId();
      vi.stubEnv("NODE_ENV", "production");
      vi.doMock("node:child_process", () => ({ execFileSync: () => execFileSync("git-missing") }));
      vi.doMock("node:fs", () => ({ readFileSync: () => "stale-build" }));
      await expect(loadNextConfig()).rejects.toThrow("Production builds require");
    });
  });
  describe("production deployment verification", () => {
    const baseUrl = "https://williamcallahan.com";
    const releaseId = "release_2026-07-13";
    const scriptUrl = `${baseUrl}/_next/static/chunks/app.js?dpl=release-123`;
    it("accepts converged HTML and a redirect-free exact nonempty JavaScript asset", async () => {
      let redirect: RequestRedirect | undefined;
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
        redirect = options?.redirect;
        return responseAt(url.toString(), "console.log('release')", "application/javascript");
      });
      try {
        await fetchStaticScript(scriptUrl);
      } finally {
        fetchSpy.mockRestore();
      }
      expect(redirect).toBe("error");
      const fetchAsset = vi.fn(async (url: string) => {
        return responseAt(url, "console.log('release')", "application/javascript; charset=utf-8");
      });
      await expect(
        validateAdvertisedJavaScript(
          investmentResponses(releaseId),
          baseUrl,
          releaseId,
          fetchAsset,
        ),
      ).resolves.toBe(true);
      expect(fetchAsset).toHaveBeenCalledOnce();
      expect(
        parseSmokeTestArguments(["williamcallahan.com", `--expected-release-id=${releaseId}`])
          ?.expectedReleaseId,
      ).toBe(releaseId);
      expect(
        parseSmokeTestArguments([
          "williamcallahan.com",
          "token",
          `--expected-release-id=${releaseId}`,
        ])?.authToken,
      ).toBe("token");
      expect(
        parseSmokeTestArguments(["williamcallahan.com", "--expected-release-id="]),
      ).toBeUndefined();
    });
    it("rejects wrong, skewed, and scriptless release HTML", async () => {
      const fetchAsset = async (url: string) =>
        responseAt(url, "export {};", "application/javascript");
      await expect(
        validateAdvertisedJavaScript(investmentResponses(releaseId), baseUrl, "other", fetchAsset),
      ).resolves.toBe(false);
      await expect(
        validateAdvertisedJavaScript(
          [...investmentResponses(releaseId), ...investmentResponses("different-release")],
          baseUrl,
          releaseId,
          fetchAsset,
        ),
      ).resolves.toBe(false);
      const scriptless = investmentResponses(releaseId).slice(0, 4);
      scriptless.push(new Response("<h1>Investment Portfolio</h1>"));
      await expect(
        validateAdvertisedJavaScript(scriptless, baseUrl, releaseId, fetchAsset),
      ).resolves.toBe(false);
      for (const [url, body, contentType] of [
        [`${baseUrl}/login`, "export {};", "application/javascript"],
        [scriptUrl, "<html>login</html>", "text/html"],
        [scriptUrl, "", "application/javascript"],
      ]) {
        await expect(
          validateAdvertisedJavaScript(
            investmentResponses(releaseId),
            baseUrl,
            releaseId,
            async () => responseAt(url, body, contentType),
          ),
        ).resolves.toBe(false);
      }
    });
    it("validates cache-rule defaults, ranges, uniqueness, and nonempty rules before deployment", () => {
      const validationScript = `
        import assert from "node:assert/strict"; import { readFileSync } from "node:fs"; import Ajv from "ajv";
        import { validateCacheRulesConfig } from "./scripts/deploy-cf-cache-rules.node.mjs";
        const schema = JSON.parse(readFileSync("./infra/cloudflare/cache-rules.schema.json", "utf8"));
        assert.equal(new Ajv().validateSchema(schema), true);
        const readConfig = () => JSON.parse(readFileSync("./infra/cloudflare/cache-rules.json", "utf8"));
        const openRange = readConfig(); openRange.rules[1].action_parameters.edge_ttl.status_code_ttl[0].status_code_range = { from: 400 };
        const [invalidRange, missingDefault, invalidDefault, unknownProperty, duplicate] = Array.from({ length: 5 }, readConfig);
        invalidRange.rules[1].action_parameters.edge_ttl.status_code_ttl[0].status_code_range = { from: 599, to: 400 };
        delete missingDefault.rules[2].action_parameters.edge_ttl.default; invalidDefault.rules[2].action_parameters.edge_ttl.default = -1;
        unknownProperty.rules[0].action_parameters.edge_tll = {}; duplicate.rules[1].description = duplicate.rules[0].description;
        assert.throws(() => validateCacheRulesConfig({ rules: [] }));
        for (const config of [invalidRange, missingDefault, invalidDefault, unknownProperty]) assert.throws(() => validateCacheRulesConfig(config));
        assert.throws(() => validateCacheRulesConfig(duplicate), /rule descriptions must be unique/);
        assert.doesNotThrow(() => validateCacheRulesConfig(openRange));
      `;
      expect(() =>
        execFileSync("node", ["--input-type=module", "--eval", validationScript]),
      ).not.toThrow();
    });
  });
});
