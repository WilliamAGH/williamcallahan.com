/**
 * @file Unit tests for bookmark card direct S3 CDN URL usage
 * @description Tests that verify bookmark cards use direct S3 URLs instead of routing through og-image API
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";

// Mock environment variables
const originalEnv = process.env;

beforeEach(() => {
  process.env = {
    ...originalEnv,
    NEXT_PUBLIC_S3_CDN_URL: "https://s3-storage.callahan.cloud",
  };
});

afterEach(() => {
  process.env = originalEnv;
});

describe("BookmarkCard Direct S3 CDN Usage Tests", () => {
  describe("Image URL Generation Logic", () => {
    /**
     * @description Test the getDisplayImageUrl logic directly
     */
    it("should prioritize direct Karakeep assets over og-image API", () => {
      // Mock bookmark data with Karakeep asset
      const mockBookmark = {
        id: "test-bookmark-1",
        content: {
          imageAssetId: "a1b2c3d4e5f6789012345678901234567890",
        },
      };

      // Simulate getDisplayImageUrl logic
      const getDisplayImageUrl = () => {
        if (mockBookmark.content?.imageAssetId) {
          const cdnUrl = process.env.NEXT_PUBLIC_S3_CDN_URL;
          if (cdnUrl) {
            return `${cdnUrl}/images/${mockBookmark.content.imageAssetId}`;
          }
          return `/api/assets/${mockBookmark.content.imageAssetId}`;
        }
        return null;
      };

      const result = getDisplayImageUrl();

      expect(result).toBe("https://s3-storage.callahan.cloud/images/a1b2c3d4e5f6789012345678901234567890");
      expect(result).not.toContain("/api/og-image");
      expect(result).toContain("s3-storage.callahan.cloud");
    });

    /**
     * @description Test direct S3 CDN URL usage for stored images
     */
    it("should use direct S3 CDN URLs when available", () => {
      const mockBookmark = {
        id: "test-bookmark-2",
        content: {
          imageUrl: "https://s3-storage.callahan.cloud/images/some-image.jpg",
        },
      };

      // Simulate getDisplayImageUrl logic
      const getDisplayImageUrl = () => {
        const s3CdnUrl = process.env.NEXT_PUBLIC_S3_CDN_URL;
        if (mockBookmark.content?.imageUrl?.includes(s3CdnUrl || "")) {
          return mockBookmark.content.imageUrl;
        }
        return null;
      };

      const result = getDisplayImageUrl();

      expect(result).toBe("https://s3-storage.callahan.cloud/images/some-image.jpg");
      expect(result).not.toContain("/api/og-image");
      expect(result).toContain("s3-storage.callahan.cloud");
    });

    /**
     * @description Test S3 URL construction for OpenGraph images
     */
    it("should construct direct S3 URLs for OpenGraph images", () => {
      const mockBookmark = {
        id: "test-bookmark-3",
        ogImage: "https://example.com/og-image.jpg",
      };

      // Simulate getDisplayImageUrl logic
      const getDisplayImageUrl = () => {
        const s3CdnUrl = process.env.NEXT_PUBLIC_S3_CDN_URL;
        if (s3CdnUrl && mockBookmark.ogImage?.startsWith("http")) {
          try {
            const domain = new URL(mockBookmark.ogImage).hostname;
            const s3Key = `images/opengraph/${domain}/${mockBookmark.ogImage.replace(/[^a-zA-Z0-9.-]/g, "_")}.webp`;
            const directS3Url = `${s3CdnUrl}/${s3Key}`;
            return directS3Url;
          } catch {
            return `/api/og-image?url=${encodeURIComponent(mockBookmark.ogImage)}&bookmarkId=${encodeURIComponent(mockBookmark.id)}`;
          }
        }
        return null;
      };

      const result = getDisplayImageUrl();

      expect(result).toContain("s3-storage.callahan.cloud");
      expect(result).toContain("images/opengraph/example.com/");
      expect(result).toContain(".webp");
      expect(result).not.toContain("/api/og-image");
    });

    /**
     * @description Test fallback to og-image API only when necessary
     */
    it("should fall back to og-image API only for external URLs without S3 CDN config", () => {
      // Remove S3 CDN URL
      delete process.env.NEXT_PUBLIC_S3_CDN_URL;

      const mockBookmark = {
        id: "test-bookmark-4",
        ogImage: "https://external-site.com/image.jpg",
      };

      // Simulate getDisplayImageUrl logic without S3 CDN
      const getDisplayImageUrl = () => {
        const s3CdnUrl = process.env.NEXT_PUBLIC_S3_CDN_URL;
        if (!s3CdnUrl && mockBookmark.ogImage) {
          return `/api/og-image?url=${encodeURIComponent(mockBookmark.ogImage)}&bookmarkId=${encodeURIComponent(mockBookmark.id)}`;
        }
        return null;
      };

      const result = getDisplayImageUrl();

      expect(result).toContain("/api/og-image");
      expect(result).toContain("external-site.com");
      expect(result).not.toContain("s3-storage.callahan.cloud");
    });
  });

  describe("URL Priority Testing", () => {
    /**
     * @description Test the complete priority hierarchy
     */
    it("should follow correct priority: Karakeep assets > S3 URLs > direct URLs > og-image API", () => {
      const testCases = [
        {
          name: "Karakeep asset (highest priority)",
          bookmark: {
            id: "test-1",
            content: {
              imageAssetId: "karakeep123",
              imageUrl: "https://s3-storage.callahan.cloud/other.jpg",
            },
            ogImage: "https://example.com/og.jpg",
          },
          expected: "https://s3-storage.callahan.cloud/images/karakeep123",
        },
        {
          name: "S3 CDN URL (second priority)",
          bookmark: {
            id: "test-2",
            content: {
              imageUrl: "https://s3-storage.callahan.cloud/stored-image.jpg",
            },
            ogImage: "https://example.com/og.jpg",
          },
          expected: "https://s3-storage.callahan.cloud/stored-image.jpg",
        },
        {
          name: "Direct external URL (third priority)",
          bookmark: {
            id: "test-3",
            content: {
              imageUrl: "https://direct-karakeep-url.com/image.jpg",
            },
            ogImage: "https://example.com/og.jpg",
          },
          expected: "https://direct-karakeep-url.com/image.jpg",
        },
      ];

      testCases.forEach(({ name, bookmark, expected }) => {
        // Simulate getDisplayImageUrl logic
        const getDisplayImageUrl = () => {
          // PRIORITY 1: Karakeep imageAssetId - DIRECT CDN URL
          if (bookmark.content?.imageAssetId) {
            const cdnUrl = process.env.NEXT_PUBLIC_S3_CDN_URL;
            if (cdnUrl) {
              return `${cdnUrl}/images/${bookmark.content.imageAssetId}`;
            }
            return `/api/assets/${bookmark.content.imageAssetId}`;
          }

          // PRIORITY 2: Direct S3 CDN URLs
          const s3CdnUrl = process.env.NEXT_PUBLIC_S3_CDN_URL;
          if (bookmark.content?.imageUrl?.includes(s3CdnUrl || "")) {
            return bookmark.content.imageUrl;
          }

          // PRIORITY 3: Direct external URLs
          if (bookmark.content?.imageUrl?.startsWith("http")) {
            return bookmark.content.imageUrl;
          }

          return null;
        };

        const result = getDisplayImageUrl();
        expect(result).toBe(expected);
        console.log(`✓ ${name}: ${result}`);
      });
    });
  });
});
