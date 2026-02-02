import { NextRequest } from "next/server";
import { sitewideRateLimitMiddleware } from "@/lib/middleware/sitewide-rate-limit";

describe("sitewideRateLimitMiddleware", () => {
  it("does not rate limit health endpoints", () => {
    const request = new NextRequest("https://example.com/api/health", {
      headers: { "x-forwarded-for": "203.0.113.10" },
    });

    for (let i = 0; i < 100; i++) {
      const result = sitewideRateLimitMiddleware(request, { storePrefix: "test-health" });
      expect(result).toBeNull();
    }
  });

  it("blocks burst traffic for page routes (15 per 10s by default)", () => {
    const storePrefix = `test-page-burst-${Date.now()}`;
    const makeRequest = () =>
      new NextRequest("https://example.com/blog", {
        headers: { "x-forwarded-for": "203.0.113.20" },
      });

    for (let i = 0; i < 15; i++) {
      const result = sitewideRateLimitMiddleware(makeRequest(), { storePrefix });
      expect(result).toBeNull();
    }

    const blocked = sitewideRateLimitMiddleware(makeRequest(), { storePrefix });
    expect(blocked).not.toBeNull();
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get("Retry-After")).toBe("10");
  });

  it("blocks burst traffic for API routes (30 per 10s by default)", () => {
    const storePrefix = `test-api-burst-${Date.now()}`;
    const makeRequest = () =>
      new NextRequest("https://example.com/api/ip", {
        headers: { "x-forwarded-for": "203.0.113.30" },
      });

    for (let i = 0; i < 30; i++) {
      const result = sitewideRateLimitMiddleware(makeRequest(), { storePrefix });
      expect(result).toBeNull();
    }

    const blocked = sitewideRateLimitMiddleware(makeRequest(), { storePrefix });
    expect(blocked).not.toBeNull();
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get("Retry-After")).toBe("10");
  });

  it("blocks burst traffic for next/image (20 per 10s by default)", () => {
    const storePrefix = `test-next-image-burst-${Date.now()}`;
    const makeRequest = () =>
      new NextRequest("https://example.com/_next/image?url=%2Ffoo.png&w=256&q=75", {
        headers: { "x-forwarded-for": "203.0.113.40" },
      });

    for (let i = 0; i < 20; i++) {
      const result = sitewideRateLimitMiddleware(makeRequest(), { storePrefix });
      expect(result).toBeNull();
    }

    const blocked = sitewideRateLimitMiddleware(makeRequest(), { storePrefix });
    expect(blocked).not.toBeNull();
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get("Retry-After")).toBe("10");
  });
});
