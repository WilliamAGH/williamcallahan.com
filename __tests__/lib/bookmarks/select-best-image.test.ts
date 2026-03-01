/**
 * @vitest-environment node
 */
import { getAssetUrl, selectBestImage } from "@/lib/bookmarks/bookmark-helpers";

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
