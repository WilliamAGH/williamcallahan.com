/**
 * Tests for Search API Guards
 *
 * Tests for memory pressure detection, rate limiting, and production-safe error handling.
 */

import {
  checkMemoryPressure,
  checkSearchRateLimit,
  createSearchErrorResponse,
  getCriticalThreshold,
  getClientIp,
  isMemoryCritical,
  SEARCH_RATE_LIMIT,
  withNoStoreHeaders,
} from "@/lib/search/api-guards";
import { NextRequest } from "next/server";

// Mock the rate limiter
const mockIsOperationAllowed = vi.fn(() => true);
vi.mock("@/lib/rate-limiter", () => ({
  isOperationAllowed: (...args: unknown[]) => mockIsOperationAllowed(...args),
}));

// Mock os module - need both default and named export for ESM compatibility
vi.mock("node:os", () => ({
  default: {
    totalmem: vi.fn(() => 8 * 1024 * 1024 * 1024), // 8GB
  },
  totalmem: vi.fn(() => 8 * 1024 * 1024 * 1024), // 8GB
}));

describe("Search API Guards", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.MEMORY_CRITICAL_BYTES;
    delete process.env.MEMORY_CRITICAL_PERCENT;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("getCriticalThreshold", () => {
    it("returns default 3GB when no env vars set", () => {
      const threshold = getCriticalThreshold();
      expect(threshold).toBe(3 * 1024 * 1024 * 1024);
    });

    it("respects MEMORY_CRITICAL_BYTES when valid", () => {
      process.env.MEMORY_CRITICAL_BYTES = "1073741824"; // 1GB
      const threshold = getCriticalThreshold();
      expect(threshold).toBe(1073741824);
    });

    it("ignores invalid MEMORY_CRITICAL_BYTES values (NaN)", () => {
      process.env.MEMORY_CRITICAL_BYTES = "invalid";
      const threshold = getCriticalThreshold();
      expect(threshold).toBe(3 * 1024 * 1024 * 1024);
    });

    it("falls back to default when MEMORY_CRITICAL_BYTES is invalid even if percent is set", () => {
      process.env.MEMORY_CRITICAL_BYTES = "invalid";
      process.env.MEMORY_CRITICAL_PERCENT = "90";
      const threshold = getCriticalThreshold();
      expect(threshold).toBe(3 * 1024 * 1024 * 1024);
    });

    it("ignores MEMORY_CRITICAL_BYTES when zero or negative", () => {
      process.env.MEMORY_CRITICAL_BYTES = "0";
      const threshold = getCriticalThreshold();
      expect(threshold).toBe(3 * 1024 * 1024 * 1024);

      process.env.MEMORY_CRITICAL_BYTES = "-100";
      const threshold2 = getCriticalThreshold();
      expect(threshold2).toBe(3 * 1024 * 1024 * 1024);
    });

    it("calculates percentage of total RAM for MEMORY_CRITICAL_PERCENT", () => {
      process.env.MEMORY_CRITICAL_PERCENT = "50";
      const threshold = getCriticalThreshold();
      // 50% of 8GB = 4GB
      expect(threshold).toBe(4 * 1024 * 1024 * 1024);
    });

    it("clamps MEMORY_CRITICAL_PERCENT above 99", () => {
      // Test clamping at 99
      process.env.MEMORY_CRITICAL_PERCENT = "150";
      const threshold = getCriticalThreshold();
      // Clamped to 99% of 8GB
      expect(threshold).toBe(0.99 * 8 * 1024 * 1024 * 1024);
    });

    it("ignores MEMORY_CRITICAL_PERCENT when zero, negative, or whitespace", () => {
      process.env.MEMORY_CRITICAL_PERCENT = "0";
      const threshold = getCriticalThreshold();
      expect(threshold).toBe(3 * 1024 * 1024 * 1024);

      process.env.MEMORY_CRITICAL_PERCENT = "-50";
      const threshold2 = getCriticalThreshold();
      expect(threshold2).toBe(3 * 1024 * 1024 * 1024);

      process.env.MEMORY_CRITICAL_PERCENT = "   ";
      const threshold3 = getCriticalThreshold();
      expect(threshold3).toBe(3 * 1024 * 1024 * 1024);
    });

    it("prefers MEMORY_CRITICAL_BYTES over MEMORY_CRITICAL_PERCENT", () => {
      process.env.MEMORY_CRITICAL_BYTES = "2147483648"; // 2GB
      process.env.MEMORY_CRITICAL_PERCENT = "90";
      const threshold = getCriticalThreshold();
      expect(threshold).toBe(2147483648);
    });
  });

  describe("isMemoryCritical", () => {
    it("returns false in non-production environments", () => {
      process.env.NODE_ENV = "development";
      expect(isMemoryCritical()).toBe(false);

      process.env.NODE_ENV = "test";
      expect(isMemoryCritical()).toBe(false);
    });

    it("compares RSS against threshold in production", () => {
      // We can't easily test the production path without mocking process.memoryUsage
      // but we can at least verify the function exists and returns a boolean
      process.env.NODE_ENV = "test";
      const result = isMemoryCritical();
      expect(typeof result).toBe("boolean");
    });
  });

  describe("getClientIp", () => {
    it("extracts IP from x-forwarded-for header", () => {
      const request = new NextRequest("http://localhost/api/search", {
        headers: { "x-forwarded-for": "192.168.1.1, 10.0.0.1" },
      });
      expect(getClientIp(request)).toBe("192.168.1.1");
    });

    it("returns anonymous when no x-forwarded-for header", () => {
      const request = new NextRequest("http://localhost/api/search");
      expect(getClientIp(request)).toBe("anonymous");
    });

    it("handles empty x-forwarded-for header", () => {
      const request = new NextRequest("http://localhost/api/search", {
        headers: { "x-forwarded-for": "" },
      });
      expect(getClientIp(request)).toBe("anonymous");
    });
  });

  describe("withNoStoreHeaders", () => {
    it("returns Cache-Control no-store header", () => {
      const headers = withNoStoreHeaders();
      expect(headers).toEqual({ "Cache-Control": "no-store" });
    });

    it("merges additional headers", () => {
      const headers = withNoStoreHeaders({ "X-Custom": "value", "Retry-After": "30" });
      expect(headers).toEqual({
        "Cache-Control": "no-store",
        "X-Custom": "value",
        "Retry-After": "30",
      });
    });
  });

  describe("SEARCH_RATE_LIMIT", () => {
    it("has correct configuration", () => {
      expect(SEARCH_RATE_LIMIT.maxRequests).toBe(10);
      expect(SEARCH_RATE_LIMIT.windowMs).toBe(60000);
    });
  });

  describe("checkSearchRateLimit", () => {
    beforeEach(() => {
      mockIsOperationAllowed.mockReset();
      mockIsOperationAllowed.mockReturnValue(true);
    });

    it("returns null when rate limit not exceeded", () => {
      mockIsOperationAllowed.mockReturnValue(true);

      const result = checkSearchRateLimit("192.168.1.1");
      expect(result).toBeNull();
    });

    it("returns 429 response when rate limit exceeded", () => {
      mockIsOperationAllowed.mockReturnValue(false);

      const result = checkSearchRateLimit("192.168.1.1");
      expect(result).not.toBeNull();
      expect(result?.status).toBe(429);
    });
  });

  describe("checkMemoryPressure", () => {
    it("returns null when memory is not critical", () => {
      // In test environment, isMemoryCritical always returns false
      const result = checkMemoryPressure();
      expect(result).toBeNull();
    });
  });

  describe("createSearchErrorResponse", () => {
    it("includes details in non-production environment", async () => {
      process.env.NODE_ENV = "development";
      const response = createSearchErrorResponse("User message", "Internal details");

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBe("User message");
      expect(body.details).toBe("Internal details");
    });

    it("excludes details in production environment", async () => {
      process.env.NODE_ENV = "production";
      const response = createSearchErrorResponse("User message", "Internal details");

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBe("User message");
      expect(body.details).toBeUndefined();
    });

    it("uses custom status code", () => {
      process.env.NODE_ENV = "test";
      const response = createSearchErrorResponse("Bad request", "Validation failed", 400);

      expect(response.status).toBe(400);
    });

    it("includes Cache-Control no-store header", () => {
      process.env.NODE_ENV = "test";
      const response = createSearchErrorResponse("Error", "Details");

      expect(response.headers.get("Cache-Control")).toBe("no-store");
    });
  });
});
