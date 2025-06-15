// Jest provides describe, it, expect, beforeEach, afterEach, beforeAll, afterAll globally
// Mock the server-cache module
jest.mock("@/lib/server-cache", () => {
  const logoCache = new Map();

  return {
    ServerCacheInstance: {
      setLogoFetch: jest.fn((domain, data) => {
        logoCache.set(domain, {
          ...data,
          timestamp: Date.now(),
        });
      }),
      getLogoFetch: jest.fn((domain) => {
        return logoCache.get(domain);
      }),
      clearLogoFetch: jest.fn((domain) => {
        logoCache.delete(domain);
      }),
      clearAllLogoFetches: jest.fn(() => {
        logoCache.clear();
      }),
      getStats: jest.fn(() => ({ hits: 0, misses: 0, keys: 0, ksize: 0, vsize: 0 })),
    },
  };
});

// Import the mocked ServerCacheInstance after the mock is defined
import { ServerCacheInstance } from "@/lib/server-cache";
import { CacheTester } from "@/lib/test-utils/cache-tester";

// Skip these tests if we're not in the correct environment
const shouldSkip = process.env.NODE_ENV === "production";

// Mock logo data for tests
const MOCK_LOGO_DATA = {
  url: "https://example.com/logo.png",
  source: "google",
};

// Use describe.skip if needed
if (shouldSkip) {
  describe.skip("Logo API Cache Tests", () => {
    it("skipped in production", () => {});
  });
} else {
  describe("Logo API Cache Tests", () => {
    beforeEach(() => {
      // Clear logo cache before each test
      CacheTester.clearCacheFor("logo");
    });

    it("should store and retrieve logo fetch results from cache", () => {
      const domain = "example.com";

      // Store logo in cache
      ServerCacheInstance.setLogoFetch(domain, MOCK_LOGO_DATA);

      // Retrieve from cache
      const cachedLogo = ServerCacheInstance.getLogoFetch(domain);

      // Verify logo is in cache
      expect(cachedLogo).not.toBeUndefined();
      expect(cachedLogo?.url).toBe(MOCK_LOGO_DATA.url);
      expect(cachedLogo?.source).toBe(MOCK_LOGO_DATA.source);
    });

    it("should update cache with different data", async () => {
      const domain = "example.com";

      // Store initial data
      ServerCacheInstance.setLogoFetch(domain, MOCK_LOGO_DATA);

      // Get initial data
      const initialCached = ServerCacheInstance.getLogoFetch(domain);
      expect(initialCached).not.toBeUndefined();

      // Store timestamp for comparison
      const initialTimestamp = initialCached?.timestamp;

      // Wait a bit to ensure timestamp will be different
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Update with different data
      const updatedData = {
        url: "https://example.com/updated-logo.png",
        source: "clearbit",
      };
      ServerCacheInstance.setLogoFetch(domain, updatedData);

      // Get updated data
      const updatedCached = ServerCacheInstance.getLogoFetch(domain);

      // Verify data was updated
      expect(updatedCached).not.toBeUndefined();
      expect(updatedCached?.url).toBe(updatedData.url);
      expect(updatedCached?.source).toBe(updatedData.source);

      // Verify timestamp was updated
      expect(updatedCached?.timestamp).toBeGreaterThan(Number(initialTimestamp));
    });

    it("should clear logo cache entries properly", () => {
      const domain = "example.com";

      // Store logo in cache
      ServerCacheInstance.setLogoFetch(domain, MOCK_LOGO_DATA);

      // Verify it's in cache
      expect(ServerCacheInstance.getLogoFetch(domain)).not.toBeUndefined();

      // Clear the cache
      CacheTester.clearCacheFor("logo");

      // Verify it's no longer in cache
      expect(ServerCacheInstance.getLogoFetch(domain)).toBeUndefined();
    });
  });
}
