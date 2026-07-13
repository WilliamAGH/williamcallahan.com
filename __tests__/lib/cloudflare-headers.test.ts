/**
 * @fileoverview Tests for Cloudflare header validation and enforcement
 * @vitest-environment node
 */

import { requireCloudflareHeaders } from "@/lib/utils/api-utils";
import { getClientIp, validateCloudflareHeaders } from "@/lib/utils/request-utils";
import { GET as getIp } from "@/app/api/ip/route";
import { UMAMI_ORIGIN } from "@/config/csp";
import { config as proxyConfig, proxy } from "@/proxy";
import {
  getRewrittenUrl,
  isRewrite,
  unstable_doesMiddlewareMatch,
} from "next/experimental/testing/server";
import { NextRequest, NextResponse } from "next/server";

const originalRewrite = Object.getOwnPropertyDescriptor(NextResponse, "rewrite");

const createRewriteResponse: typeof NextResponse.rewrite = (destination, init) => {
  const response = NextResponse.next(init);
  response.headers.set("x-middleware-rewrite", destination.toString());
  return response;
};

function createProxyRequest(url: string, method: "GET" | "POST"): NextRequest {
  const request = new NextRequest(url, { method });
  if (!Reflect.set(request, "nextUrl", new URL(url))) {
    throw new Error("Could not set NextRequest.nextUrl for proxy behavior test");
  }
  return request;
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
    if (originalRewrite) {
      Object.defineProperty(NextResponse, "rewrite", originalRewrite);
      return;
    }
    if (!Reflect.deleteProperty(NextResponse, "rewrite")) {
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

  it("flags missing cf-ray", () => {
    const headers = new Headers({
      "cf-connecting-ip": "203.0.113.5",
      "x-forwarded-for": "173.245.48.1",
    });

    const validation = validateCloudflareHeaders(headers);
    expect(validation.isValid).toBe(false);
    expect(validation.reasons).toContain("missing_cf_ray");
  });

  it("flags invalid IPs", () => {
    const headers = new Headers({
      "cf-ray": "1234abcd",
      "cf-connecting-ip": "not-an-ip",
      "x-forwarded-for": "173.245.48.1",
    });

    const validation = validateCloudflareHeaders(headers);
    expect(validation.isValid).toBe(false);
    expect(validation.reasons).toContain("invalid_cf_ip");
  });

  it("skips enforcement outside production", () => {
    vi.stubEnv("NODE_ENV", "development");

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

  it("matches both same-origin Umami endpoints before the external rewrite", () => {
    expect(
      unstable_doesMiddlewareMatch({
        config: proxyConfig,
        url: "https://williamcallahan.com/stats/script.js",
      }),
    ).toBe(true);
    expect(
      unstable_doesMiddlewareMatch({
        config: proxyConfig,
        url: "https://williamcallahan.com/api/send",
      }),
    ).toBe(true);
    expect(
      unstable_doesMiddlewareMatch({
        config: proxyConfig,
        url: "https://williamcallahan.com/_next/static/chunks/app.js",
      }),
    ).toBe(false);
  });

  it("rewrites the GET tracker request with its exact query and no-store headers", async () => {
    const response = await proxy(
      createProxyRequest(
        "https://williamcallahan.com/stats/script.js?cache=123&source=home",
        "GET",
      ),
    );

    expect(isRewrite(response)).toBe(true);
    expect(getRewrittenUrl(response)).toBe(`${UMAMI_ORIGIN}/script.js?cache=123&source=home`);
    expect(response.headers.get("cache-control")).toBe(
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    );
    expect(response.headers.get("cdn-cache-control")).toBe("no-store, max-age=0");
    expect(response.headers.get("cloudflare-cdn-cache-control")).toBe("no-store, max-age=0");
  });

  it("rewrites the POST event request with its exact query and no-store headers", async () => {
    const response = await proxy(
      createProxyRequest("https://williamcallahan.com/api/send?event=pageview&source=home", "POST"),
    );

    expect(isRewrite(response)).toBe(true);
    expect(getRewrittenUrl(response)).toBe(`${UMAMI_ORIGIN}/api/send?event=pageview&source=home`);
    expect(response.headers.get("cache-control")).toBe(
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    );
    expect(response.headers.get("cdn-cache-control")).toBe("no-store, max-age=0");
    expect(response.headers.get("cloudflare-cdn-cache-control")).toBe("no-store, max-age=0");
  });
});
