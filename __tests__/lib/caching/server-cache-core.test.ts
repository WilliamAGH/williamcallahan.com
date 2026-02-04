/**
 * @file Unit tests for ServerCache core operations
 * Tests cache statistics, clear operations, and edge cases.
 * @module __tests__/lib/caching/server-cache-core.test
 */
import { ServerCacheInstance, type ServerCache } from "@/lib/server-cache";
import type { MockInstance } from "vitest";

describe("ServerCache - Core Operations", () => {
  let cache: ServerCache;
  let consoleWarnSpy: MockInstance;

  beforeEach(() => {
    cache = ServerCacheInstance;
    cache.flushAll();
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    cache.flushAll();
    consoleWarnSpy.mockRestore();
    vi.restoreAllMocks();
  });

  describe("Cache Statistics", () => {
    it("should return cache statistics", () => {
      const initialStats = cache.getStats();
      const initialKeys = initialStats.keys;

      cache.set("key1", "value1");
      cache.get("key1"); // hit
      cache.get("key2"); // miss

      const stats = cache.getStats();
      expect(stats.keys).toBe(initialKeys + 1); // One new key added
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });

    it("should track hits and misses", () => {
      cache.get("miss1");
      cache.set("hit1", "value");
      cache.get("hit1");
      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });
  });

  describe("Clear Operations", () => {
    it("should clear all caches with clearAllCaches", () => {
      cache.setLogoValidation("hash", true);
      cache.set("test-entry", { data: "test" });
      cache.clearAllCaches();
      // Logo validation should be preserved (documented behavior)
      expect(cache.getLogoValidation("hash")).toBeDefined();
      // Other entries should be cleared
      expect(cache.get("test-entry")).toBeUndefined();
    });

    it("should clear all caches with flushAll", () => {
      cache.setLogoValidation("hash", true);
      cache.set("test-entry", { data: "test" });
      cache.flushAll();
      // Logo validation should be preserved (documented behavior)
      expect(cache.getLogoValidation("hash")).toBeDefined();
      // Other entries should be cleared
      expect(cache.get("test-entry")).toBeUndefined();
    });
  });

  describe("Edge Cases", () => {
    it("should handle undefined/null data gracefully", () => {
      cache.set("key_undefined", undefined);
      cache.set("key_null", null);
      expect(cache.get("key_undefined")).toBeUndefined();
      expect(cache.get("key_null")).toBeUndefined(); // Cache doesn't store null values
    });

    it("should not store buffer data in logo fetch cache", () => {
      const domain = "buffer.com";
      const fetchResult = {
        s3Key: "key",
        cdnUrl: "url",
        source: "google" as const,
        contentType: "image/png",
        retrieval: "external" as const,
        buffer: Buffer.from("test"),
      };
      cache.setLogoFetch(domain, fetchResult);
      const result = cache.getLogoFetch(domain);
      expect(result?.buffer).toBeUndefined();
    });
  });
});
