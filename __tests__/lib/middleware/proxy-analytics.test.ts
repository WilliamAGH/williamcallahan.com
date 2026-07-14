import { NextRequest } from "next/server";
import { UMAMI_ORIGIN } from "@/config/csp";
import { proxy } from "@/proxy";

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
