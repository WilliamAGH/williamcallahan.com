/**
 * @vitest-environment node
 */
import { selectBestImage } from "@/lib/bookmarks/bookmark-helpers";

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
});
