/**
 * @vitest-environment node
 */
import { getAssetUrl, selectBestImage } from "@/lib/bookmarks/bookmark-helpers";
import { buildCdnUrl } from "@/lib/utils/cdn-utils";
import { parseS3Endpoint } from "@/types/schemas/s3-config";

describe("selectBestImage", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_S3_CDN_URL: "https://s3-storage.callahan.cloud",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns trusted CDN ogImage when host matches", () => {
    const result = selectBestImage(
      {
        id: "bookmark-1",
        url: "https://example.com",
        ogImage: "https://s3-storage.callahan.cloud/opengraph-images/abc123.jpg",
        content: {
          type: "link",
          url: "https://example.com",
          title: "Example",
          description: "Example",
          imageAssetId: "asset-123",
        },
      },
      { includeScreenshots: true },
    );

    expect(result).toBe("https://s3-storage.callahan.cloud/opengraph-images/abc123.jpg");
  });

  it("rejects CDN substring spoofing and falls back to Karakeep assets", () => {
    const result = selectBestImage(
      {
        id: "bookmark-2",
        url: "https://example.com",
        ogImage: "https://s3-storage.callahan.cloud.attacker.com/malicious.jpg",
        content: {
          type: "link",
          url: "https://example.com",
          title: "Example",
          description: "Example",
          imageAssetId: "asset-456",
        },
      },
      { includeScreenshots: true },
    );

    expect(result).toBeTruthy();
    expect(result).toMatch(/^\/api\/assets\/asset-456/);
  });

  it("canonicalizes protocol-less S3 endpoints before selecting an image", () => {
    process.env.S3_BUCKET = "media-bucket";
    process.env.S3_SERVER_URL = "sfo3.digitaloceanspaces.com";

    const result = selectBestImage(
      {
        id: "bookmark-protocol-less",
        url: "https://example.com",
        ogImage: "https://external.example.com/image.jpg",
        content: {
          type: "link",
          url: "https://example.com",
          title: "Example",
          description: "Example",
          imageAssetId: "asset-protocol-less",
        },
      },
      { includeScreenshots: true },
    );

    expect(result).toBe("/api/assets/asset-protocol-less");
  });

  it.each([
    ["sfo3.digitaloceanspaces.com", "https://sfo3.digitaloceanspaces.com"],
    ["http://localhost:9000", "http://localhost:9000"],
  ])("parses S3 endpoint %s as %s", (input, expected) => {
    expect(parseS3Endpoint(input)).toBe(expected);
  });

  it("preserves an explicit HTTP endpoint when building a direct S3 URL", () => {
    expect(
      buildCdnUrl("images/example.jpg", {
        s3BucketName: "media-bucket",
        s3ServerUrl: "http://localhost:9000",
      }),
    ).toBe("http://media-bucket.localhost:9000/images/example.jpg");
  });

  it("rejects malformed S3 endpoints", () => {
    expect(() => parseS3Endpoint("ftp://example.com")).toThrow(
      "S3_SERVER_URL must be a valid HTTP(S) endpoint.",
    );
  });

  it.each([
    "https://example.com/storage",
    "https://example.com?region=us-east-1",
    "https://example.com#storage",
    "https://access:secret@example.com",
  ])("rejects non-origin S3 endpoint %s", (endpoint) => {
    expect(() => parseS3Endpoint(endpoint)).toThrow(
      "S3_SERVER_URL must be a valid HTTP(S) endpoint.",
    );
  });

  it("returns canonical asset URL even when context is provided", () => {
    const result = getAssetUrl("asset-789", {
      bookmarkId: "bookmark-789",
      url: "https://example.com/path",
      domain: "example.com",
    });

    expect(result).toBe("/api/assets/asset-789");
  });

  it("can disable imageAssetId usage to force screenshot fallback", () => {
    const result = selectBestImage(
      {
        id: "bookmark-3",
        url: "https://example.com",
        ogImage: "https://untrusted.example.com/og.jpg",
        content: {
          type: "link",
          url: "https://example.com",
          title: "Example",
          description: "Example",
          imageAssetId: "asset-image",
          screenshotAssetId: "asset-shot",
        },
      },
      { includeImageAssets: false, includeScreenshots: true },
    );

    expect(result).toBe("/api/assets/asset-shot");
  });

  it("can prefer screenshotAssetId over imageAssetId", () => {
    const result = selectBestImage(
      {
        id: "bookmark-4",
        url: "https://example.com",
        ogImage: undefined,
        content: {
          type: "link",
          url: "https://example.com",
          title: "Example",
          description: "Example",
          imageAssetId: "asset-image",
          screenshotAssetId: "asset-shot",
        },
      },
      { includeImageAssets: true, includeScreenshots: true, preferScreenshots: true },
    );

    expect(result).toBe("/api/assets/asset-shot");
  });
});
