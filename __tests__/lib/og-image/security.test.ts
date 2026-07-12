/**
 * OG Image Security Module Tests
 * @module __tests__/lib/og-image/security.test
 * @description
 * Tests SSRF protection: private host blocking, protocol restrictions,
 * URL resolution with the canonical server base, and redirect safety.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchImageAsDataUrl } from "@/lib/og-image/fetch-image";
import { isPrivateHost, ensureAbsoluteUrl } from "@/lib/og-image/security";
import { getBaseUrl } from "@/lib/utils/get-base-url";

vi.mock("@/lib/utils/get-base-url", () => ({
  getBaseUrl: vi.fn(() => "https://williamcallahan.com"),
}));

vi.mock("sharp", () => ({
  default: vi.fn(() => ({
    png: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("fake-png")),
  })),
}));

beforeEach(() => {
  vi.mocked(getBaseUrl).mockReturnValue("https://williamcallahan.com");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isPrivateHost", () => {
  it("blocks localhost variants", () => {
    expect(isPrivateHost("localhost")).toBe(true);
    expect(isPrivateHost("LOCALHOST")).toBe(true);
    expect(isPrivateHost("127.0.0.1")).toBe(true);
    expect(isPrivateHost("0.0.0.0")).toBe(true);
  });

  it("blocks IPv6 loopback", () => {
    expect(isPrivateHost("::1")).toBe(true);
    expect(isPrivateHost("[::1]")).toBe(true);
  });

  it("blocks private IPv4 ranges", () => {
    expect(isPrivateHost("10.0.0.1")).toBe(true);
    expect(isPrivateHost("172.16.0.1")).toBe(true);
    expect(isPrivateHost("172.31.255.255")).toBe(true);
    expect(isPrivateHost("192.168.1.1")).toBe(true);
  });

  it("blocks cloud metadata endpoints", () => {
    expect(isPrivateHost("169.254.169.254")).toBe(true);
    expect(isPrivateHost("metadata.google.internal")).toBe(true);
  });

  it("blocks trailing-dot private host variants", () => {
    expect(isPrivateHost("localhost.")).toBe(true);
    expect(isPrivateHost("127.0.0.1.")).toBe(true);
    expect(isPrivateHost("metadata.google.internal.")).toBe(true);
  });

  it("blocks IPv6-mapped IPv4 private addresses", () => {
    expect(isPrivateHost("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateHost("::ffff:10.0.0.1")).toBe(true);
    expect(isPrivateHost("::ffff:192.168.1.1")).toBe(true);
  });

  it("allows public hostnames", () => {
    expect(isPrivateHost("example.com")).toBe(false);
    expect(isPrivateHost("cdn.cloudflare.com")).toBe(false);
    expect(isPrivateHost("8.8.8.8")).toBe(false);
    expect(isPrivateHost("142.250.80.46")).toBe(false);
  });
});

describe("ensureAbsoluteUrl", () => {
  it("resolves relative paths against the canonical base URL", () => {
    const result = ensureAbsoluteUrl("/api/cache/images?url=test");
    expect(result).toBe("https://williamcallahan.com/api/cache/images?url=test");
  });

  it("passes through absolute URLs", () => {
    const result = ensureAbsoluteUrl("https://example.com/image.png");
    expect(result).toBe("https://example.com/image.png");
  });

  it("allows a private host only when it is the canonical base", () => {
    vi.mocked(getBaseUrl).mockReturnValue("http://localhost:3000");
    const result = ensureAbsoluteUrl("/api/cache/images");
    expect(result).toBe("http://localhost:3000/api/cache/images");
  });

  it("blocks private hosts that are not the canonical base", () => {
    expect(() => ensureAbsoluteUrl("http://localhost:9999/secret")).toThrow(
      /Blocked image URL host/,
    );
    expect(() => ensureAbsoluteUrl("http://127.0.0.1/admin")).toThrow(/Blocked image URL host/);
    expect(() => ensureAbsoluteUrl("http://169.254.169.254/latest/meta-data")).toThrow(
      /Blocked image URL host/,
    );
    expect(() => ensureAbsoluteUrl("//169.254.169.254/latest/meta-data")).toThrow(
      /Blocked image URL host/,
    );
  });

  it("rejects non-http protocols", () => {
    expect(() => ensureAbsoluteUrl("file:///etc/passwd")).toThrow(/Unsupported image URL protocol/);
    expect(() => ensureAbsoluteUrl("ftp://example.com/file")).toThrow(
      /Unsupported image URL protocol/,
    );
  });
});

describe("fetchImageAsDataUrl", () => {
  it("uses redirect error policy at the fetch boundary", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1]), {
        headers: { "content-type": "image/png" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchImageAsDataUrl("https://example.com/cover.png")).resolves.toBe(
      "data:image/png;base64,ZmFrZS1wbmc=",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/cover.png",
      expect.objectContaining({ redirect: "error" }),
    );
  });
});
