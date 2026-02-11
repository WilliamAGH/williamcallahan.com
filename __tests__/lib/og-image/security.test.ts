/**
 * OG Image Security Module Tests
 * @module __tests__/lib/og-image/security.test
 * @description
 * Tests SSRF protection: private host blocking, protocol restrictions,
 * and URL resolution with origin-based validation.
 */

import { describe, it, expect } from "vitest";
import { isPrivateHost, ensureAbsoluteUrl } from "@/lib/og-image/security";

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
  const origin = "https://williamcallahan.com";

  it("resolves relative paths against origin", () => {
    const result = ensureAbsoluteUrl("/api/cache/images?url=test", origin);
    expect(result).toBe("https://williamcallahan.com/api/cache/images?url=test");
  });

  it("passes through absolute URLs", () => {
    const result = ensureAbsoluteUrl("https://example.com/image.png", origin);
    expect(result).toBe("https://example.com/image.png");
  });

  it("allows same-origin private hosts", () => {
    const localOrigin = "http://localhost:3000";
    const result = ensureAbsoluteUrl("/api/cache/images", localOrigin);
    expect(result).toBe("http://localhost:3000/api/cache/images");
  });

  it("blocks cross-origin private hosts", () => {
    expect(() => ensureAbsoluteUrl("http://localhost:9999/secret", origin)).toThrow(
      /Blocked image URL host/,
    );
    expect(() => ensureAbsoluteUrl("http://127.0.0.1/admin", origin)).toThrow(
      /Blocked image URL host/,
    );
    expect(() => ensureAbsoluteUrl("http://169.254.169.254/latest/meta-data", origin)).toThrow(
      /Blocked image URL host/,
    );
  });

  it("rejects non-http protocols", () => {
    expect(() => ensureAbsoluteUrl("file:///etc/passwd", origin)).toThrow(
      /Unsupported image URL protocol/,
    );
    expect(() => ensureAbsoluteUrl("ftp://example.com/file", origin)).toThrow(
      /Unsupported image URL protocol/,
    );
  });
});
