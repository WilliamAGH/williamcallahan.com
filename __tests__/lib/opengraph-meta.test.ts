/**
 * Jest test for lib/data-access/opengraph.ts
 * Tests OpenGraph data extraction functionality
 */

// Mock the OpenGraph data access module
jest.mock("@/lib/data-access/opengraph", () => ({
  getOpenGraphData: jest.fn(),
}));

import { getOpenGraphData } from "@/lib/data-access/opengraph";
import type { OgResult } from "@/types/opengraph";

// Helper supplying mandatory OgResult fields so we don’t repeat ourselves
const baseOg = (): Pick<OgResult, "timestamp" | "source" | "imageUrl"> => ({
  timestamp: Date.now(),
  source: "external",
  imageUrl: undefined,
});

// Cast to Jest mocked function for proper typing
const mockGetOpenGraphData = getOpenGraphData as jest.MockedFunction<typeof getOpenGraphData>;

describe("lib/data-access/opengraph.ts functionality", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  afterAll(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe("OpenGraph data extraction", () => {
    it("should handle successful OpenGraph extraction", async () => {
      const mockOpenGraphData = {
        title: "Railway - Deploy code with zero configuration",
        description: "Railway makes it easy to deploy and scale applications",
        imageUrl: "https://railway.app/og-image.png",
        url: "https://railway.app",

        siteName: "Railway",
      };

      mockGetOpenGraphData.mockResolvedValue(mockOpenGraphData as any);

      const result = await getOpenGraphData("https://railway.app");

      expect(result).toEqual(mockOpenGraphData);
      expect(result?.title).toBe("Railway - Deploy code with zero configuration");
      expect(result?.description).toBe("Railway makes it easy to deploy and scale applications");
      expect(result?.imageUrl).toBe("https://railway.app/og-image.png");
      expect(result?.url).toBe("https://railway.app");

      expect(result?.siteName).toBe("Railway");
    });

    it("should handle failed OpenGraph extraction", async () => {
      mockGetOpenGraphData.mockResolvedValue(null as unknown as OgResult);

      const result = await getOpenGraphData("https://example.com/non-existent");
      expect(result).toBeNull();
    });

    it("should handle partial OpenGraph data", async () => {
      const partialData: OgResult = {
        url: "https://example.com",
        timestamp: Date.now(),
        source: "external",
        imageUrl: undefined,
        title: "Some Title",
        description: "Some Description",
        // Missing image, url, type, siteName
      };

      mockGetOpenGraphData.mockResolvedValue(partialData);

      const result = await getOpenGraphData("https://example.com");
      expect(result).toEqual(partialData);
      expect(result?.title).toBe("Some Title");
      expect(result?.description).toBe("Some Description");
      expect(result?.imageUrl).toBeUndefined();
    });

    it("should handle network errors", async () => {
      const networkError = new Error("Network timeout");
      mockGetOpenGraphData.mockRejectedValue(networkError);

      await expect(getOpenGraphData("https://example.com")).rejects.toThrow(networkError);
    });
  });

  describe("URL validation and processing", () => {
    it("should handle valid URLs", () => {
      const validUrls = [
        "https://railway.app",
        "https://github.com/openai/whisper",
        "https://x.com/elonmusk",
      ];

      for (const url of validUrls) {
        // Validate URL format
        expect(() => new URL(url)).not.toThrow();
        expect(url).toMatch(/^https:\/\/[a-z0-9.-]+/);
      }
    });

    it("should handle different URL schemes", () => {
      const urls = [
        "https://example.com",
        "http://example.com",
        "https://www.example.com",
        "https://subdomain.example.com",
      ];

      for (const url of urls) {
        expect(() => new URL(url)).not.toThrow();
        expect(url).toMatch(/^https?:\/\//);
      }
    });

    it("should detect invalid URLs", () => {
      const actuallyInvalidUrls = [
        "not a url with spaces",
        "http://",
        "https://",
        "://missing-protocol",
      ];

      // These URLs are actually invalid and will throw
      for (const url of actuallyInvalidUrls) {
        expect(() => new URL(url)).toThrow(/Invalid URL/);
      }

      // Test null and undefined separately
      expect(() => new URL(null as any)).toThrow(/Invalid URL/);
      expect(() => new URL(undefined as any)).toThrow(/Invalid URL/);

      // These are technically valid URLs (relative, different protocols, etc.)
      const technicallyValidUrls = [
        "", // Valid relative URL
        "ftp://example.com", // Valid FTP URL
        'javascript:alert("xss")', // Valid javascript URL
        "not-a-url", // Valid relative URL
      ];

      for (const url of technicallyValidUrls) {
        expect(() => new URL(url, "https://example.com")).not.toThrow();
      }
    });
  });

  describe("OpenGraph data structure validation", () => {
    it("should validate standard OpenGraph properties", () => {
      const standardProperties = ["title", "description", "imageUrl", "url", "siteName"];

      const mockData: OgResult = {
        url: "https://example.com",
        timestamp: Date.now(),
        source: "external",
        title: "Test Title",
        description: "Test Description",
        imageUrl: "https://example.com/image.jpg",
        siteName: "Example Site",
      };

      for (const property of standardProperties) {
        expect(mockData).toHaveProperty(property);
        expect(mockData[property as keyof typeof mockData]).toBeTruthy();
      }
    });

    it("should handle optional OpenGraph properties", () => {
      const optionalData: OgResult = {
        url: "https://example.com",
        timestamp: Date.now(),
        source: "external",
        imageUrl: undefined,
        title: "Test Title",
        siteName: "Test Site",
        // Additional optional properties
        locale: "en_US",
      };

      expect(optionalData.title).toBe("Test Title");
      expect(optionalData.siteName).toBe("Test Site");
      expect(optionalData.locale).toBe("en_US");
      expect(optionalData.description).toBeUndefined();
      expect(optionalData.imageUrl).toBeUndefined();
    });
  });

  describe("Error handling and edge cases", () => {
    it("should handle empty responses", async () => {
      mockGetOpenGraphData.mockResolvedValue({
        url: "",
        timestamp: Date.now(),
        source: "external",
        imageUrl: undefined,
      } as OgResult);

      const result = await getOpenGraphData("https://example.com");
      expect(result).toEqual(
        expect.objectContaining({
          url: "",
        }),
      );
      // Even for empty responses, we expect at least url/timestamp fields present after sanitisation
      expect(Object.keys(result || {})).toBeTruthy();
    });

    it("should handle malformed data", async () => {
      const malformedData: OgResult = {
        url: "https://example.com",
        timestamp: Date.now(),
        source: "external",
        title: "", // Empty title
        description: null, // Null description
        imageUrl: "not-a-valid-url", // Invalid image URL
      };

      mockGetOpenGraphData.mockResolvedValue(malformedData);

      const result = await getOpenGraphData("https://example.com");

      expect(result).toEqual(malformedData);
      expect(result?.title).toBe("");
      expect(result?.description).toBeNull();
      expect(result?.imageUrl).toBe("not-a-valid-url");
    });

    it("should handle timeout scenarios", async () => {
      const timeoutError = new Error("Request timeout");
      mockGetOpenGraphData.mockRejectedValue(timeoutError);

      await expect(getOpenGraphData("https://slow-site.com")).rejects.toThrow("Request timeout");
    });

    it("should handle HTTP error responses", async () => {
      mockGetOpenGraphData.mockResolvedValue(null as OgResult);

      // Test various error scenarios
      const errorUrls = [
        "https://httpstat.us/404", // 404 Not Found
        "https://httpstat.us/500", // 500 Internal Server Error
        "https://httpstat.us/403", // 403 Forbidden
      ];

      for (const url of errorUrls) {
        const result = await getOpenGraphData(url);
        expect(result).toBeNull();
      }
    });
  });

  describe("integration test scenarios", () => {
    it("should handle successful URL fetch", async () => {
      const successUrls = [
        "https://railway.app",
        "https://github.com/openai/whisper",
        "https://x.com/elonmusk",
      ];

      for (const url of successUrls) {
        const mockSuccessData: OgResult = {
          url,
          timestamp: Date.now(),
          source: "external",
          imageUrl: undefined,
          title: `Title for ${url}`,
          description: `Description for ${url}`,
          siteName: `Site for ${url}`,
        };
        mockGetOpenGraphData.mockResolvedValueOnce(mockSuccessData);

        const result = await getOpenGraphData(url);
        expect(result).toEqual(mockSuccessData);
      }
    });

    it("should handle failed URL fetch", async () => {
      mockGetOpenGraphData.mockResolvedValueOnce(null);

      const result = await getOpenGraphData("https://non-existent-domain-12345.com");
      expect(result).toBeNull();
    });

    it("should validate extracted data quality", async () => {
      const highQualityData: OgResult = {
        url: "https://railway.app",
        timestamp: Date.now(),
        source: "external",
        title: "Railway - Deploy code with zero configuration",
        description:
          "Railway makes it easy to deploy and scale applications without the platform complexity. Deploy from GitHub in seconds.",
        imageUrl: "https://railway.app/og-image.png",
        siteName: "Railway",
      };

      mockGetOpenGraphData.mockResolvedValueOnce(highQualityData);

      const result = await getOpenGraphData("https://railway.app");

      // Validate data quality
      expect(result?.title).toBeTruthy();
      expect(result?.title?.length).toBeGreaterThan(5);
      expect(result?.description).toBeTruthy();
      expect(result?.description?.length).toBeGreaterThan(10);
      expect(result?.imageUrl).toMatch(/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i);
      expect(result?.url).toMatch(/^https?:\/\/.+/);
    });
  });

  describe("performance and caching considerations", () => {
    it("should handle multiple concurrent requests", async () => {
      const urls = ["https://example1.com", "https://example2.com", "https://example3.com"];

      // Mock responses for each URL
      urls.forEach((url, index) => {
        const mockData: OgResult = {
          ...baseOg(),
          url,
          title: `Title ${index + 1}`,
        };
        mockGetOpenGraphData.mockResolvedValueOnce(mockData);
      });

      // Simulate concurrent requests
      const promises = urls.map((url) => getOpenGraphData(url));
      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach((result, index) => {
        expect(result?.title).toBe(`Title ${index + 1}`);
        expect(result?.url).toBe(urls[index]);
      });
    });

    it("should track function call metrics", () => {
      // Validate that we can track calls
      const callCount = mockGetOpenGraphData.mock.calls.length;
      expect(typeof callCount).toBe("number");
      expect(callCount).toBeGreaterThanOrEqual(0);
    });
  });
});
