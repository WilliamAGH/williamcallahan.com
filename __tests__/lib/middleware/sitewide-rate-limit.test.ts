import { NextRequest } from "next/server";
import { sitewideRateLimitMiddleware, PROFILES } from "@/lib/middleware/sitewide-rate-limit";

describe("sitewideRateLimitMiddleware", () => {
  it("does not rate limit health endpoints", () => {
    const request = new NextRequest("https://example.com/api/health", {
      headers: { "x-forwarded-for": "203.0.113.10" },
    });

    const iterations = PROFILES.page.burst.maxRequests * 2;
    for (let i = 0; i < iterations; i++) {
      const result = sitewideRateLimitMiddleware(request, { storePrefix: "test-health" });
      expect(result).toBeNull();
    }
  });

  it("blocks burst traffic for page routes", () => {
    const storePrefix = `test-page-burst-${Date.now()}`;
    const makeRequest = () =>
      new NextRequest("https://example.com/blog", {
        headers: { "x-forwarded-for": "203.0.113.20" },
      });

    const limit = PROFILES.page.burst.maxRequests;
    for (let i = 0; i < limit; i++) {
      const result = sitewideRateLimitMiddleware(makeRequest(), { storePrefix });
      expect(result).toBeNull();
    }

    const blocked = sitewideRateLimitMiddleware(makeRequest(), { storePrefix });
    expect(blocked).not.toBeNull();
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get("Retry-After")).toBe("10");
  });

  it("blocks burst traffic for API routes", () => {
    const storePrefix = `test-api-burst-${Date.now()}`;
    const makeRequest = () =>
      new NextRequest("https://example.com/api/ip", {
        headers: { "x-forwarded-for": "203.0.113.30" },
      });

    const limit = PROFILES.api.burst.maxRequests;
    for (let i = 0; i < limit; i++) {
      const result = sitewideRateLimitMiddleware(makeRequest(), { storePrefix });
      expect(result).toBeNull();
    }

    const blocked = sitewideRateLimitMiddleware(makeRequest(), { storePrefix });
    expect(blocked).not.toBeNull();
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get("Retry-After")).toBe("10");
  });

  it("blocks burst traffic for next/image", () => {
    const storePrefix = `test-next-image-burst-${Date.now()}`;
    const makeRequest = () =>
      new NextRequest("https://example.com/_next/image?url=%2Ffoo.png&w=256&q=75", {
        headers: { "x-forwarded-for": "203.0.113.40" },
      });

    const limit = PROFILES.nextImage.burst.maxRequests;
    for (let i = 0; i < limit; i++) {
      const result = sitewideRateLimitMiddleware(makeRequest(), { storePrefix });
      expect(result).toBeNull();
    }

    const blocked = sitewideRateLimitMiddleware(makeRequest(), { storePrefix });
    expect(blocked).not.toBeNull();
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get("Retry-After")).toBe("10");
  });
});
