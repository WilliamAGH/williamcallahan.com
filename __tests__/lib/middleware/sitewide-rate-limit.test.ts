import { NextRequest } from "next/server";
import { sitewideRateLimitMiddleware, PROFILES } from "@/lib/middleware/sitewide-rate-limit";
import { classifyProxyRequest } from "@/lib/utils/request-utils";

describe("sitewideRateLimitMiddleware", () => {
  describe("request classification", () => {
    it("classifies _rsc query requests as rsc", () => {
      const request = new NextRequest("https://example.com/projects?_rsc=abc123");
      expect(classifyProxyRequest(request)).toBe("rsc");
    });

    it("classifies requests with prefetch headers as prefetch", () => {
      const request = new NextRequest("https://example.com/projects", {
        headers: { "next-router-prefetch": "1" },
      });
      expect(classifyProxyRequest(request)).toBe("prefetch");
    });

    it("classifies normal route navigations as document", () => {
      const request = new NextRequest("https://example.com/projects", {
        headers: { accept: "text/html,application/xhtml+xml" },
      });
      expect(classifyProxyRequest(request)).toBe("document");
    });
  });

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

  it("blocks burst traffic for document routes with HTML response", async () => {
    const storePrefix = `test-page-burst-${Date.now()}`;
    const makeRequest = () =>
      new NextRequest("https://example.com/blog", {
        headers: {
          "x-forwarded-for": "203.0.113.20",
          accept: "text/html,application/xhtml+xml",
        },
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
    expect(blocked?.headers.get("Content-Type")).toContain("text/html");
    const body = await new Response(blocked?.body).text();
    expect(body).toContain("You've reached a rate limit. Please wait a few minutes and try again.");
  });

  it("blocks burst traffic for API routes with standardized JSON", async () => {
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
    const payload = await blocked?.json();
    expect(payload).toMatchObject({
      code: "RATE_LIMITED",
      message: "You've reached a rate limit. Please wait a few minutes and try again.",
      retryAfterSeconds: 10,
      status: 429,
    });
  });

  it("does not independently throttle next/image requests", () => {
    const storePrefix = `test-next-image-${Date.now()}`;
    const makeRequest = () =>
      new NextRequest("https://example.com/_next/image?url=%2Ffoo.png&w=256&q=75", {
        headers: { "x-forwarded-for": "203.0.113.40" },
      });

    const attempts = PROFILES.page.burst.maxRequests * 2;
    for (let i = 0; i < attempts; i++) {
      const result = sitewideRateLimitMiddleware(makeRequest(), { storePrefix });
      expect(result).toBeNull();
    }
  });

  it("does not independently throttle _rsc requests", () => {
    const storePrefix = `test-rsc-${Date.now()}`;
    const makeRequest = () =>
      new NextRequest("https://example.com/projects?_rsc=1abc", {
        headers: { "x-forwarded-for": "203.0.113.41" },
      });

    const attempts = PROFILES.page.burst.maxRequests * 2;
    for (let i = 0; i < attempts; i++) {
      const result = sitewideRateLimitMiddleware(makeRequest(), { storePrefix });
      expect(result).toBeNull();
    }
  });

  it("does not independently throttle prefetch requests", () => {
    const storePrefix = `test-prefetch-${Date.now()}`;
    const makeRequest = () =>
      new NextRequest("https://example.com/projects", {
        headers: {
          "x-forwarded-for": "203.0.113.42",
          "next-router-prefetch": "1",
        },
      });

    const attempts = PROFILES.page.burst.maxRequests * 2;
    for (let i = 0; i < attempts; i++) {
      const result = sitewideRateLimitMiddleware(makeRequest(), { storePrefix });
      expect(result).toBeNull();
    }
  });
});
