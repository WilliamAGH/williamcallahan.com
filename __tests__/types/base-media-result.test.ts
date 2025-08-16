import type { BaseMediaResult, ImageResult } from "@/types/image";
import type { LogoResult } from "@/types/logo";

describe("BaseMediaResult Type System", () => {
  describe("Type compatibility", () => {
    it("should allow ImageResult to extend BaseMediaResult", () => {
      const imageResult: ImageResult = {
        contentType: "image/png",
        source: "s3",
        cdnUrl: "https://cdn.example.com/image.png",
        s3Key: "images/example.png",
        s3Url: "https://s3.example.com/images/example.png",
        timestamp: Date.now(),
      };

      // Should be assignable to BaseMediaResult
      const baseResult: BaseMediaResult = imageResult;
      expect(baseResult.contentType).toBe("image/png");
      expect(baseResult.cdnUrl).toBe("https://cdn.example.com/image.png");
      expect(baseResult.s3Key).toBe("images/example.png");
    });

    it("should allow LogoResult to extend BaseMediaResult", () => {
      const logoResult: LogoResult = {
        contentType: "image/svg+xml",
        source: "google",
        cdnUrl: "https://cdn.example.com/logo.svg",
        s3Key: "logos/google/example.com.svg",
        url: "https://example.com/logo.svg",
        retrieval: "s3-store",
        timestamp: Date.now(),
      };

      // Should be assignable to BaseMediaResult
      const baseResult: BaseMediaResult = logoResult;
      expect(baseResult.contentType).toBe("image/svg+xml");
      expect(baseResult.cdnUrl).toBe("https://cdn.example.com/logo.svg");
      expect(baseResult.s3Key).toBe("logos/google/example.com.svg");
    });

    it("should handle optional properties correctly", () => {
      // Minimal valid BaseMediaResult
      const minimalResult: BaseMediaResult = {
        contentType: "image/jpeg",
      };

      expect(minimalResult.contentType).toBe("image/jpeg");
      expect(minimalResult.cdnUrl).toBeUndefined();
      expect(minimalResult.error).toBeUndefined();
      expect(minimalResult.timestamp).toBeUndefined();
      expect(minimalResult.buffer).toBeUndefined();
      expect(minimalResult.s3Key).toBeUndefined();
    });

    it("should handle error states", () => {
      const errorResult: BaseMediaResult = {
        contentType: "application/octet-stream",
        error: "Failed to fetch image",
        timestamp: Date.now(),
      };

      expect(errorResult.error).toBe("Failed to fetch image");
      expect(errorResult.buffer).toBeUndefined();
      expect(errorResult.cdnUrl).toBeUndefined();
    });

    it("should handle buffer data", () => {
      const bufferData = Buffer.from("test image data");
      const resultWithBuffer: BaseMediaResult = {
        contentType: "image/png",
        buffer: bufferData,
        timestamp: Date.now(),
      };

      expect(resultWithBuffer.buffer).toBe(bufferData);
      expect(resultWithBuffer.buffer?.toString()).toBe("test image data");
    });
  });

  describe("Type distinctions", () => {
    it("should maintain distinct properties for ImageResult", () => {
      const imageResult: ImageResult = {
        contentType: "image/webp",
        source: "origin",
        s3Url: "https://s3.example.com/image.webp", // ImageResult-specific
      };

      // @ts-expect-error - LogoResult properties should not be on ImageResult
      expect(imageResult.url).toBeUndefined();
      // @ts-expect-error - LogoResult properties should not be on ImageResult
      expect(imageResult.retrieval).toBeUndefined();
      // @ts-expect-error - LogoResult properties should not be on ImageResult
      expect(imageResult.inversion).toBeUndefined();
    });

    it("should maintain distinct properties for LogoResult", () => {
      const logoResult: LogoResult = {
        contentType: "image/png",
        source: "clearbit",
        url: "https://logo.clearbit.com/example.com", // LogoResult-specific
        retrieval: "external", // LogoResult-specific
        inversion: {
          // LogoResult-specific
          needsDarkInversion: true,
          needsLightInversion: false,
          hasTransparency: true,
          brightness: 0.8,
          format: "png",
          dimensions: { width: 100, height: 100 },
        },
      };

      // @ts-expect-error - ImageResult properties should not be on LogoResult
      expect(logoResult.s3Url).toBeUndefined();
    });
  });

  describe("Common use cases", () => {
    it("should support generic processing functions", () => {
      // Function that works with any BaseMediaResult
      function processMediaResult(result: BaseMediaResult): string {
        if (result.error) {
          return `Error: ${result.error}`;
        }
        if (result.cdnUrl) {
          return `CDN: ${result.cdnUrl}`;
        }
        if (result.s3Key) {
          return `S3: ${result.s3Key}`;
        }
        return "No URL available";
      }

      const imageResult: ImageResult = {
        contentType: "image/png",
        source: "s3",
        cdnUrl: "https://cdn.example.com/image.png",
      };

      const logoResult: LogoResult = {
        contentType: "image/svg+xml",
        source: "google",
        s3Key: "logos/example.svg",
      };

      expect(processMediaResult(imageResult)).toBe("CDN: https://cdn.example.com/image.png");
      expect(processMediaResult(logoResult)).toBe("S3: logos/example.svg");
    });

    it("should support type guards", () => {
      function isImageResult(result: BaseMediaResult): result is ImageResult {
        return "source" in result && typeof result.source === "string" && ("s3Url" in result || !("url" in result)); // ImageResult has s3Url, LogoResult has url
      }

      function isLogoResult(result: BaseMediaResult): result is LogoResult {
        return "source" in result && ("url" in result || "retrieval" in result || "inversion" in result); // LogoResult-specific properties
      }

      const imageResult: ImageResult = {
        contentType: "image/png",
        source: "s3",
        s3Url: "https://s3.example.com/image.png",
      };

      const logoResult: LogoResult = {
        contentType: "image/svg+xml",
        source: "google",
        url: "https://example.com/logo.svg",
      };

      expect(isImageResult(imageResult)).toBe(true);
      expect(isImageResult(logoResult)).toBe(false);
      expect(isLogoResult(logoResult)).toBe(true);
      expect(isLogoResult(imageResult)).toBe(false);
    });
  });
});
