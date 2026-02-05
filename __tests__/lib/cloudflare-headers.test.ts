/**
 * @fileoverview Tests for Cloudflare header validation and enforcement
 * @vitest-environment node
 */

import { requireCloudflareHeaders } from "@/lib/utils/api-utils";
import { validateCloudflareHeaders } from "@/lib/utils/request-utils";

describe("Cloudflare header enforcement", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("validates when cf-ray and cf-connecting-ip are present", () => {
    const headers = new Headers({
      "cf-ray": "1234abcd",
      "cf-connecting-ip": "203.0.113.5",
    });

    const validation = validateCloudflareHeaders(headers);
    expect(validation.isValid).toBe(true);
    expect(validation.reasons).toEqual([]);
  });

  it("flags missing cf-ray", () => {
    const headers = new Headers({
      "cf-connecting-ip": "203.0.113.5",
    });

    const validation = validateCloudflareHeaders(headers);
    expect(validation.isValid).toBe(false);
    expect(validation.reasons).toContain("missing_cf_ray");
  });

  it("flags invalid IPs", () => {
    const headers = new Headers({
      "cf-ray": "1234abcd",
      "cf-connecting-ip": "not-an-ip",
    });

    const validation = validateCloudflareHeaders(headers);
    expect(validation.isValid).toBe(false);
    expect(validation.reasons).toContain("invalid_cf_ip");
  });

  it("skips enforcement outside production", () => {
    process.env.NODE_ENV = "development";

    const headers = new Headers();
    const response = requireCloudflareHeaders(headers, { route: "/api/ai/token" });
    expect(response).toBeNull();
  });

  it("blocks when headers are missing in production", () => {
    process.env.NODE_ENV = "production";
    process.env.API_BASE_URL = "https://williamcallahan.com";

    const headers = new Headers();
    const response = requireCloudflareHeaders(headers, { route: "/api/ai/token" });
    expect(response?.status).toBe(403);
  });
});
