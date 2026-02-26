/**
 * Tests for Search API Guards
 *
 * Tests for rate limiting and production-safe error handling.
 */

import {
  applySearchGuards,
  checkSearchRateLimit,
  createSearchErrorResponse,
  getClientIp,
  SEARCH_RATE_LIMIT,
  withNoStoreHeaders,
} from "@/lib/search/api-guards";
import { NextRequest } from "next/server";

// Mock the rate limiter
const mockIsOperationAllowed = vi.fn(() => true);
vi.mock("@/lib/rate-limiter", () => ({
  isOperationAllowed: (...args: unknown[]) => mockIsOperationAllowed(...args),
}));

describe("Search API Guards", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
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

    it("returns standardized 429 response when rate limit exceeded", async () => {
      mockIsOperationAllowed.mockReturnValue(false);

      const result = checkSearchRateLimit("192.168.1.1");
      expect(result).not.toBeNull();
      expect(result?.status).toBe(429);
      expect(result?.headers.get("Retry-After")).toBe("60");
      expect(result?.headers.get("X-RateLimit-Limit")).toBe("10");
      expect(result?.headers.get("X-RateLimit-Window")).toBe("60s");
      const payload = await result?.json();
      expect(payload).toMatchObject({
        code: "RATE_LIMITED",
        message: "You've reached a rate limit. Please wait a few minutes and try again.",
        retryAfterSeconds: 60,
        status: 429,
      });
    });
  });

  describe("applySearchGuards", () => {
    it("returns null when request is under rate limit", () => {
      mockIsOperationAllowed.mockReturnValue(true);
      const request = new NextRequest("http://localhost/api/search?q=test");
      expect(applySearchGuards(request)).toBeNull();
    });

    it("returns the rate-limit response when request exceeds limits", () => {
      mockIsOperationAllowed.mockReturnValue(false);
      const request = new NextRequest("http://localhost/api/search?q=test");
      const response = applySearchGuards(request);
      expect(response).not.toBeNull();
      expect(response?.status).toBe(429);
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
