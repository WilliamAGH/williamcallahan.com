/**
 * OG Image Security Module Tests
 * @module __tests__/lib/og-image/security.test
 * @description
 * Tests SSRF protection: private host blocking, protocol restrictions,
 * URL resolution with the canonical server base, and redirect safety.
 */

import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchImageAsDataUrl,
  ImagePixelLimitError,
  openPixelBoundedImage,
} from "@/lib/og-image/fetch-image";
import { isPrivateHost, ensureAbsoluteUrl } from "@/lib/og-image/security";
import { getBaseUrl } from "@/lib/utils/get-base-url";
import { openGraphUrlSchema } from "@/types/schemas/url";

vi.mock("@/lib/utils/get-base-url", () => ({
  getBaseUrl: vi.fn(() => "https://williamcallahan.com"),
}));

const COVER_BOX = { width: 420, height: 500 };

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

  it("projects cloud metadata protection from the URL schema", () => {
    const metadataUrl = "http://metadata.google.internal/computeMetadata/v1";

    expect(isPrivateHost("169.254.169.254")).toBe(true);
    expect(openGraphUrlSchema.safeParse(metadataUrl).success).toBe(false);
    expect(isPrivateHost(new URL(metadataUrl).hostname)).toBe(true);
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
    const image = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"></svg>',
    );
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(image, {
        headers: { "content-type": "image/svg+xml" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchImageAsDataUrl("https://example.com/cover.png", COVER_BOX)).resolves.toMatch(
      /^data:image\/png;base64,/,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/cover.png",
      expect.objectContaining({ redirect: "error" }),
    );
  });

  it("encodes a high-resolution photo at its render box, not its source size", async () => {
    const noise = Buffer.alloc(2400 * 1800 * 3);
    for (let index = 0; index < noise.length; index++) noise[index] = Math.random() * 256;
    const photo = await sharp(noise, { raw: { width: 2400, height: 1800, channels: 3 } })
      .jpeg({ quality: 60 })
      .toBuffer();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(photo, { headers: { "content-type": "image/jpeg" } })),
    );

    const dataUrl = await fetchImageAsDataUrl("https://example.com/photo.jpg", COVER_BOX);
    const encoded = Buffer.from(dataUrl?.split(",")[1] ?? "", "base64");

    await expect(sharp(encoded).metadata()).resolves.toMatchObject(COVER_BOX);
  });

  it("preserves the typed pixel-limit rejection across the fetch boundary", async () => {
    const image = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="8001" height="5000"></svg>',
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(image, {
          headers: { "content-type": "image/svg+xml" },
        }),
      ),
    );

    await expect(
      fetchImageAsDataUrl("https://example.com/large.svg", COVER_BOX),
    ).rejects.toBeInstanceOf(ImagePixelLimitError);
  });
});

describe("openPixelBoundedImage", () => {
  it.each([
    ["an ordinary image", 2, 2],
    ["an image exactly at the pixel limit", 8_000, 5_000],
  ])("accepts %s", async (_label, width, height) => {
    const image = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"></svg>`,
    );

    await expect(openPixelBoundedImage(image)).resolves.toBeDefined();
  });

  it("rejects an image above the pixel limit", async () => {
    const image = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="8001" height="5000"></svg>',
    );

    await expect(openPixelBoundedImage(image)).rejects.toBeInstanceOf(ImagePixelLimitError);
  });
});
