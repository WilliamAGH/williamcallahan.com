/**
 * @file Unit tests for ServerCache logo-related caching
 * Tests logo validation, fetch results, inverted logos, and analysis caching.
 * @module __tests__/lib/caching/server-cache-logos.test
 */
import { ServerCacheInstance, type ServerCache } from "@/lib/server-cache";
import type { MockInstance } from "vitest";

/** Factory for creating logo fetch result test fixtures */
const createLogoFetchResult = (s3Key: string, cdnUrl: string) => ({
  s3Key,
  cdnUrl,
  source: "google" as const,
  contentType: "image/png",
  retrieval: "external" as const,
});

describe("ServerCache - Logos", () => {
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

  describe("Logo Validation", () => {
    it("should cache and retrieve logo validation results", () => {
      const imageHash = "test-hash-123";

      expect(cache.getLogoValidation(imageHash)).toBeUndefined();

      cache.setLogoValidation(imageHash, true);

      const result = cache.getLogoValidation(imageHash);
      expect(result).toBeDefined();
      expect(result?.isGlobeIcon).toBe(true);
      expect(result?.timestamp).toBeDefined();
    });

    it("should handle multiple validation entries", () => {
      cache.setLogoValidation("hash1", true);
      cache.setLogoValidation("hash2", false);

      expect(cache.getLogoValidation("hash1")?.isGlobeIcon).toBe(true);
      expect(cache.getLogoValidation("hash2")?.isGlobeIcon).toBe(false);
    });
  });

  describe("Logo Fetch", () => {
    it("should cache and retrieve logo fetch results", () => {
      const domain = "example.com";
      const fetchResult = {
        s3Key: "images/logos/example.com_google.png",
        cdnUrl: "https://cdn.example.com/logos/example.com_google.png",
        source: "google" as const,
        contentType: "image/png",
        retrieval: "external" as const,
      };

      cache.setLogoFetch(domain, fetchResult);

      const result = cache.getLogoFetch(domain);
      expect(result).toBeDefined();
      expect(result?.s3Key).toBe("images/logos/example.com_google.png");
      expect(result?.cdnUrl).toBe("https://cdn.example.com/logos/example.com_google.png");
      expect(result?.source).toBe("google");
      expect(result?.contentType).toBe("image/png");
      expect(result?.timestamp).toBeDefined();
      expect(result?.buffer).toBeUndefined();
    });

    it("should handle error results with shorter TTL", () => {
      const domain = "error.com";
      cache.setLogoFetch(domain, {
        error: "Failed to fetch",
        s3Key: null,
        cdnUrl: null,
        source: null,
        contentType: "",
        retrieval: "external",
      });

      const result = cache.getLogoFetch(domain);
      expect(result?.error).toBe("Failed to fetch");
    });

    it("should clear individual logo fetch results", () => {
      cache.setLogoFetch("domain1.com", createLogoFetchResult("key1", "url1"));
      cache.setLogoFetch("domain2.com", createLogoFetchResult("key2", "url2"));

      cache.clearLogoFetch("domain1.com");

      expect(cache.getLogoFetch("domain1.com")).toBeUndefined();
      expect(cache.getLogoFetch("domain2.com")?.cdnUrl).toBe("url2");
    });

    it("should clear all logo fetch results", () => {
      cache.setLogoFetch("domain1.com", createLogoFetchResult("key1", "url1"));
      cache.setLogoFetch("domain2.com", createLogoFetchResult("key2", "url2"));

      cache.clearAllLogoFetches();

      expect(cache.getLogoFetch("domain1.com")).toBeUndefined();
      expect(cache.getLogoFetch("domain2.com")).toBeUndefined();
    });
  });

  describe("Inverted Logo", () => {
    it("should cache and retrieve inverted logo metadata", () => {
      const cacheKey = "inverted-key";
      const entry = {
        s3Key: "inverted/inverted-key",
        analysis: {
          hasTransparency: true,
          brightness: 0.8,
          needsLightInversion: false,
          needsDarkInversion: true,
        },
        contentType: "image/png",
      };

      cache.setInvertedLogo(cacheKey, entry);

      const result = cache.getInvertedLogo(cacheKey);
      expect(result).toBeDefined();
      expect(result?.buffer).toBeUndefined();
      expect(result?.s3Key).toBe("inverted/inverted-key");
      expect(result?.analysis).toEqual(entry.analysis);
      expect(result?.contentType).toBe("image/png");
      expect(result?.timestamp).toBeDefined();
    });
  });

  describe("Logo Analysis", () => {
    it("should cache and retrieve logo analysis", () => {
      const cacheKey = "analysis-key";
      const analysis = {
        shouldInvert: false,
        brightness: 0.3,
        needsInversion: false,
      };

      cache.setLogoAnalysis(cacheKey, analysis);

      const result = cache.getLogoAnalysis(cacheKey);
      expect(result).toEqual(analysis);
    });
  });
});
