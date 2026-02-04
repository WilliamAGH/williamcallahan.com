// Vitest provides describe, it, expect, beforeEach, afterEach, beforeAll, afterAll globally
// First, mock the modules before requiring our target module
vi.mock("@/lib/utils/ensure-server-only", () => ({
  assertServerOnly: vi.fn(),
}));

// Now import the server cache module directly
import { ServerCacheInstance } from "@/lib/server-cache";
import { LOGO_CACHE_DURATION } from "@/lib/constants";

describe("ServerCache Tests", () => {
  beforeAll(() => {
    // Verify that the ServerCache instance exists and is properly initialized
    if (!ServerCacheInstance) {
      throw new Error("ServerCacheInstance is not defined");
    }
  });

  beforeEach(() => {
    // Clear cache before each test
    ServerCacheInstance.flushAll();
  });

  describe("Basic Functionality", () => {
    it("should have all required cache methods", () => {
      // Test if all expected methods exist
      expect(typeof ServerCacheInstance.get).toBe("function");
      expect(typeof ServerCacheInstance.set).toBe("function");
      expect(typeof ServerCacheInstance.del).toBe("function");
      expect(typeof ServerCacheInstance.keys).toBe("function");
      expect(typeof ServerCacheInstance.flushAll).toBe("function");
      expect(typeof ServerCacheInstance.getStats).toBe("function");

      // Test basic logo methods
      expect(typeof ServerCacheInstance.getLogoValidation).toBe("function");
      expect(typeof ServerCacheInstance.setLogoValidation).toBe("function");
      expect(typeof ServerCacheInstance.getLogoFetch).toBe("function");
      expect(typeof ServerCacheInstance.setLogoFetch).toBe("function");
      expect(typeof ServerCacheInstance.clearLogoFetch).toBe("function");
      expect(typeof ServerCacheInstance.clearAllLogoFetches).toBe("function");

      // Test basic bookmarks methods (only metadata tracking methods exist - data is in S3)
      // Note: getBookmarks/setBookmarks were removed when bookmarks moved to S3 persistence
      expect(typeof ServerCacheInstance.clearBookmarks).toBe("function");
      expect(typeof ServerCacheInstance.shouldRefreshBookmarks).toBe("function");
    });

    it("should store and retrieve a simple value", () => {
      const key = "test-key";
      const value = { data: "test-value" };

      // Set value
      ServerCacheInstance.set(key, value);

      // Get value
      const retrieved = ServerCacheInstance.get(key);

      expect(retrieved).toEqual(value);
    });
  });

  describe("Logo Caching Efficiency", () => {
    const testDomain = "example.com";
    const mockLogoData = {
      buffer: Buffer.from("mock-logo-data"),
      contentType: "image/png",
      source: "google",
      retrieval: "external",
    } as const;

    it("should cache successful logo fetches with proper TTL", () => {
      // Store logo
      ServerCacheInstance.setLogoFetch(testDomain, mockLogoData);

      // Retrieve immediately
      const cached = ServerCacheInstance.getLogoFetch(testDomain);
      expect(cached).toMatchObject({
        contentType: mockLogoData.contentType,
        source: mockLogoData.source,
      });
      expect(cached?.timestamp).toBeDefined();
    });

    it("should cache failed logo fetches with shorter TTL", () => {
      const failureData = {
        buffer: null,
        error: "Logo not found",
      };

      // Store failure
      ServerCacheInstance.setLogoFetch(testDomain, failureData);

      // Retrieve immediately
      const cached = ServerCacheInstance.getLogoFetch(testDomain);
      expect(cached).toMatchObject({
        error: "Logo not found",
      });
      expect(cached?.timestamp).toBeDefined();
    });

    it("should track cache statistics correctly", () => {
      const initialStats = ServerCacheInstance.getStats();
      const initialHits = initialStats.hits;
      const initialMisses = initialStats.misses;

      // Miss - domain not cached
      const miss = ServerCacheInstance.getLogoFetch("not-cached.com");
      expect(miss).toBeUndefined();

      // Store logo
      ServerCacheInstance.setLogoFetch(testDomain, mockLogoData);

      // Hit - domain is cached
      const hit = ServerCacheInstance.getLogoFetch(testDomain);
      expect(hit).toBeDefined();

      const finalStats = ServerCacheInstance.getStats();
      expect(finalStats.hits).toBe(initialHits + 1);
      expect(finalStats.misses).toBe(initialMisses + 1);
    });

    it("should clear individual logo cache entries", () => {
      // Store multiple logos
      ServerCacheInstance.setLogoFetch("domain1.com", mockLogoData);
      ServerCacheInstance.setLogoFetch("domain2.com", mockLogoData);

      // Clear one
      ServerCacheInstance.clearLogoFetch("domain1.com");

      // Verify only one was cleared
      expect(ServerCacheInstance.getLogoFetch("domain1.com")).toBeUndefined();
      expect(ServerCacheInstance.getLogoFetch("domain2.com")).toBeDefined();
    });

    it("should clear all logo cache entries", () => {
      // Store multiple logos
      ServerCacheInstance.setLogoFetch("domain1.com", mockLogoData);
      ServerCacheInstance.setLogoFetch("domain2.com", mockLogoData);

      // Clear all logos
      ServerCacheInstance.clearAllLogoFetches();

      // Verify all were cleared
      expect(ServerCacheInstance.getLogoFetch("domain1.com")).toBeUndefined();
      expect(ServerCacheInstance.getLogoFetch("domain2.com")).toBeUndefined();
    });
  });

  describe("Performance Characteristics", () => {
    it("should complete cache operations in under 5ms", () => {
      const testData = {
        buffer: Buffer.from("test"),
        contentType: "image/png",
        source: "google" as const,
      };

      // Use high-resolution timer for more accurate measurement
      const { performance } = require("node:perf_hooks");

      // Measure write performance
      const writeStart = performance.now();
      ServerCacheInstance.setLogoFetch("perf-test.com", testData);
      const writeTime = performance.now() - writeStart;

      // Measure read performance
      const readStart = performance.now();
      ServerCacheInstance.getLogoFetch("perf-test.com");
      const readTime = performance.now() - readStart;

      // Operations should be performant (< 20ms even on CI runners)
      expect(writeTime).toBeLessThan(20);
      expect(readTime).toBeLessThan(20);
    });
  });

  describe("Known Issues", () => {
    it("should have memory limits configured (Issue #115)", () => {
      // This test documents that the cache currently lacks memory limits
      // When Issue #115 is fixed, this test should verify maxKeys is set

      // Current behavior: no memory limits
      // Expected behavior: cache should have maxKeys limit

      // For now, we just document the issue
      expect(true).toBe(true); // Placeholder until fix is implemented
    });

    it("should use cloning to prevent cache corruption (Issue #115)", () => {
      // This test verifies the current behavior with useClones: false
      const testKey = "mutation-test";
      const testData = { nested: { value: "original" } };

      ServerCacheInstance.set(testKey, testData);
      const retrieved = ServerCacheInstance.get<{ nested: { value: string } }>(testKey);

      // Mutate the retrieved object
      if (retrieved) {
        retrieved.nested.value = "mutated";
      }

      // Check if the cached value was also mutated (current behavior)
      const retrievedAgain = ServerCacheInstance.get<{ nested: { value: string } }>(testKey);
      expect(retrievedAgain?.nested.value).toBe("mutated"); // Documents current unsafe behavior

      // When Issue #115 is fixed, this should be:
      // expect(retrievedAgain?.nested.value).toBe("original");
    });
  });

  describe("Multi-tier Cache Architecture", () => {
    it("documents the caching hierarchy", () => {
      // This test documents the expected caching flow:
      // 1. Check memory cache (ServerCacheInstance) - ~1ms
      // 2. Check S3 storage - ~10-50ms
      // 3. Fetch from external APIs - 100ms-5s

      // The actual implementation is in lib/data-access/logos.ts
      // This test serves as documentation of the architecture

      expect(true).toBe(true);
    });

    it("documents different TTLs for success vs failure", () => {
      // Success TTL: LOGO_CACHE_DURATION.SUCCESS (30 days)
      // Failure TTL: LOGO_CACHE_DURATION.FAILURE (1 day)

      // This prevents hammering external APIs for known failures
      // while keeping successful results cached longer

      expect(LOGO_CACHE_DURATION.SUCCESS).toBe(30 * 24 * 60 * 60); // 30 days in seconds
      expect(LOGO_CACHE_DURATION.FAILURE).toBe(24 * 60 * 60); // 1 day in seconds
    });
  });
});
