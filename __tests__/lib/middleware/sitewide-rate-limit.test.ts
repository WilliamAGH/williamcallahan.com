import { NextRequest } from "next/server";
import { UMAMI_ORIGIN } from "@/config/csp";
import { proxy } from "@/proxy";
import { sitewideRateLimitMiddleware, PROFILES } from "@/lib/middleware/sitewide-rate-limit";
import { classifyProxyRequest, shouldApplyHtmlCachePolicy } from "@/lib/utils/request-utils";

function createAnalyticsRequest(query: string): NextRequest {
  const url = `https://williamcallahan.com/stats/script.js?${query}`;
  const request = new NextRequest(url);
  Object.defineProperty(request, "nextUrl", { value: new URL(url) });
  Object.defineProperty(request, "signal", { value: new AbortController().signal });
  return request;
}

describe("analytics proxy", () => {
  it("keeps final headers safe and bounds the upstream request", async () => {
    const timeoutSignal = AbortSignal.abort(new DOMException("timed out", "TimeoutError"));
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    timeoutSpy.mockReturnValueOnce(new AbortController().signal).mockReturnValueOnce(timeoutSignal);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response("analytics", {
          status: 206,
          headers: {
            "cache-control": "public, max-age=86400",
            "content-type": "application/javascript; charset=utf-8",
            location: "https://evil.example",
            "set-cookie": "private=value",
            "x-middleware-rewrite": "https://evil.example",
          },
        }),
      )
      .mockRejectedValueOnce(timeoutSignal.reason);
    try {
      const response = await proxy(createAnalyticsRequest("source=home"));
      expect(fetchSpy.mock.calls[0]?.[0].toString()).toBe(`${UMAMI_ORIGIN}/script.js?source=home`);
      expect(response.status).toBe(206);
      await expect(response.text()).resolves.toBe("analytics");
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(response.headers.get("cdn-cache-control")).toBe("no-store, max-age=0");
      expect(response.headers.get("cloudflare-cdn-cache-control")).toBe("no-store, max-age=0");
      for (const header of ["location", "set-cookie", "x-middleware-rewrite"]) {
        expect(response.headers.get(header)).toBeUndefined();
      }
      const timeoutResponse = await proxy(createAnalyticsRequest("timeout=1"));
      expect(timeoutResponse.status).toBe(504);
      expect(timeoutResponse.headers.get("cache-control")).toContain("no-store");
      expect(timeoutSpy).toHaveBeenLastCalledWith(10_000);
      expect(errorSpy).toHaveBeenCalledOnce();
    } finally {
      fetchSpy.mockRestore();
      timeoutSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it("propagates non-timeout analytics fetch failures", async () => {
    const upstreamError = new Error("analytics connection failed");
    const timeoutSpy = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(new AbortController().signal);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(upstreamError);
    try {
      await expect(proxy(createAnalyticsRequest("failure=1"))).rejects.toBe(upstreamError);
    } finally {
      fetchSpy.mockRestore();
      timeoutSpy.mockRestore();
    }
  });
});

describe("sitewideRateLimitMiddleware", () => {
  describe("request classification", () => {
    it("keeps API cache policy under route ownership", () => {
      expect(shouldApplyHtmlCachePolicy("/api/cache/images")).toBe(false);
      expect(shouldApplyHtmlCachePolicy("/api/posts")).toBe(false);
      expect(shouldApplyHtmlCachePolicy("/blog/article")).toBe(true);
    });

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

    it("classifies HEAD requests to pages as document", () => {
      const request = new NextRequest("https://example.com/projects", {
        method: "HEAD",
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

  it("blocks burst HEAD traffic for document routes", () => {
    const storePrefix = `test-page-head-burst-${Date.now()}`;
    const makeRequest = () =>
      new NextRequest("https://example.com/projects", {
        method: "HEAD",
        headers: {
          "x-forwarded-for": "203.0.113.21",
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

  it.each([
    ["next/image", "https://example.com/_next/image?url=%2Ffoo.png&w=256&q=75", {}],
    ["RSC", "https://example.com/projects?_rsc=1abc", {}],
    ["prefetch", "https://example.com/projects", { "next-router-prefetch": "1" }],
  ])("blocks burst traffic for %s requests with standardized JSON", async (name, url, headers) => {
    const storePrefix = `test-${name}-${Date.now()}`;
    const makeRequest = () =>
      new NextRequest(url, {
        headers: { ...headers, "x-forwarded-for": "203.0.113.40" },
      });

    const limit = PROFILES.page.burst.maxRequests;
    for (let i = 0; i < limit; i++) {
      const result = sitewideRateLimitMiddleware(makeRequest(), { storePrefix });
      expect(result).toBeNull();
    }

    const blocked = sitewideRateLimitMiddleware(makeRequest(), { storePrefix });
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get("Retry-After")).toBe("10");
    expect(blocked?.headers.get("Content-Type")).toContain("application/json");
    await expect(blocked?.json()).resolves.toMatchObject({
      code: "RATE_LIMITED",
      retryAfterSeconds: 10,
      status: 429,
    });
  });

  it("counts spoofable page request classes in one shared profile", () => {
    const storePrefix = `test-shared-page-${Date.now()}`;
    const requests = [
      new NextRequest("https://example.com/projects", {
        headers: { "x-forwarded-for": "203.0.113.50", accept: "text/html" },
      }),
      new NextRequest("https://example.com/projects?_rsc=1abc", {
        headers: { "x-forwarded-for": "203.0.113.50" },
      }),
      new NextRequest("https://example.com/projects", {
        headers: {
          "x-forwarded-for": "203.0.113.50",
          "next-router-prefetch": "1",
        },
      }),
      new NextRequest("https://example.com/_next/image?url=%2Ffoo.png&w=256&q=75", {
        headers: { "x-forwarded-for": "203.0.113.50" },
      }),
    ];

    const limit = PROFILES.page.burst.maxRequests;
    for (let i = 0; i < limit; i++) {
      const request = requests[i % requests.length];
      if (!request) throw new Error("Expected a page request fixture");
      expect(sitewideRateLimitMiddleware(request, { storePrefix })).toBeNull();
    }

    const rscRequest = requests[1];
    if (!rscRequest) throw new Error("Expected an RSC request fixture");
    expect(sitewideRateLimitMiddleware(rscRequest, { storePrefix })?.status).toBe(429);
  });
});
