import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

function createAnalyticsRequest(query: string): NextRequest {
  const url = `https://williamcallahan.com/stats/script.js?${query}`;
  const request = new NextRequest(url);
  Object.defineProperty(request, "nextUrl", { value: new URL(url) });
  Object.defineProperty(request, "signal", { value: new AbortController().signal });
  return request;
}

describe("analytics proxy", () => {
  it("returns a cache-safe disabled response for retired Umami", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const response = await proxy(createAnalyticsRequest("source=home"));
      expect(response.status).toBe(410);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
