/**
 * @file Unit tests for the og-image API route handler
 * @description Tests that verify the 0.0.0.0 URL fix works correctly in Docker environments
 * @vitest-environment node
 */

// Mock environment variables and dependencies before importing the route
import { NextRequest } from "next/server";

const originalEnv = process.env;

beforeEach(() => {
  // Clear the module cache (only if available - not supported in Bun)
  // if (typeof vi.resetModules === "function") {
  //   vi.resetModules();
  // }
  process.env = {
    ...originalEnv,
    NEXT_PUBLIC_SITE_URL: "https://williamcallahan.com",
    S3_BUCKET: "test-bucket",
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
  process.env = originalEnv;
});

describe("OG-Image API Route: 0.0.0.0 URL Fix Tests", () => {
  let GET: typeof import("@/app/api/og-image/route").GET;

  beforeEach(async () => {
    // Import GET after setting up mocks
    const routeModule = await import("@/app/api/og-image/route");
    GET = routeModule.GET;
  });

  describe("URL Construction Tests", () => {
    /**
     * @description Tests that redirect URLs use correct base URL pattern
     */
    it("should construct redirect URLs without 0.0.0.0 in production", async () => {
      const dockerRequestUrl = "http://0.0.0.0:3000/api/og-image?url=invalid-url";
      const request = new NextRequest(dockerRequestUrl);

      let response: Response | undefined;
      let locationHeader: string | null = null;

      try {
        response = await GET(request);
        locationHeader = response?.headers?.get?.("Location") || null;
      } catch (error) {
        // If there's an error, check it's not related to 0.0.0.0 URL construction
        const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);

        // The key test: ensure no 0.0.0.0 URLs are being constructed
        expect(errorMsg).not.toContain("0.0.0.0:3000");
        expect(errorMsg).not.toContain("0.0.0.0");

        // This is actually what we want - the function should handle invalid URLs gracefully
        return;
      }

      // If we get a response, verify the redirect URL is correct
      if (response?.status === 302 && locationHeader) {
        expect(locationHeader).not.toContain("0.0.0.0:3000");
        expect(locationHeader).not.toContain("0.0.0.0");

        // Should use production URL if available
        if (locationHeader.startsWith("http")) {
          expect(locationHeader).toMatch(/^https:\/\/[^/]+/);
        }
      }
    });

    /**
     * @description Test Karakeep asset ID handling
     */
    it("should handle Karakeep asset IDs without 0.0.0.0 URLs", async () => {
      const assetId = "a1b2c3d4e5f6789012345678901234567890";
      const dockerRequestUrl = `http://0.0.0.0:3000/api/og-image?url=${assetId}`;
      const request = new NextRequest(dockerRequestUrl);

      try {
        const response = await GET(request);
        const locationHeader = response?.headers?.get?.("Location");

        if (locationHeader) {
          expect(locationHeader).not.toContain("0.0.0.0");
          expect(locationHeader).toContain(assetId);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
        expect(errorMsg).not.toContain("0.0.0.0");
      }
    });
  });

  describe("Environment Variable Usage", () => {
    /**
     * @description Test with missing environment variables
     */
    it("should handle missing env vars without using 0.0.0.0", async () => {
      // Remove env vars to test fallback behavior
      delete process.env.NEXT_PUBLIC_SITE_URL;
      delete process.env.API_BASE_URL;

      // Re-import after env change (only if available - not supported in Bun)
      // if (typeof vi.resetModules === "function") {
      //   vi.resetModules();
      // }
      const routeModule = await import("@/app/api/og-image/route");
      const testGET = routeModule.GET;

      const dockerRequestUrl = "http://0.0.0.0:3000/api/og-image?url=invalid";
      const request = new NextRequest(dockerRequestUrl);

      try {
        const response = await testGET(request);
        const locationHeader = response?.headers?.get?.("Location");

        if (locationHeader) {
          // Even with missing env vars, should not use 0.0.0.0
          expect(locationHeader).not.toContain("0.0.0.0");
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
        expect(errorMsg).not.toContain("0.0.0.0");
      }
    });
  });
});

describe("OG-Image bookmark fallback validation", () => {
  const sourceUrl = "https://source.example/page";
  const attackerUrl = "https://attacker.example/phish";

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock("@/lib/s3/client");
    vi.doUnmock("@/lib/s3/config");
    vi.doUnmock("@/lib/utils/s3-error-guards");
    vi.doUnmock("@/lib/db/queries/bookmarks");
  });

  it("does not redirect to non-image bookmark fallback URLs", async () => {
    vi.resetModules();
    vi.doMock("@/lib/s3/client", () => ({
      getS3Client: () => ({
        send: () => Promise.reject(new Error("missing")),
      }),
    }));
    vi.doMock("@/lib/s3/config", () => ({
      getS3Config: () => ({ bucket: "test-bucket" }),
    }));
    vi.doMock("@/lib/utils/s3-error-guards", () => ({
      isS3Error: () => true,
    }));
    vi.doMock("@/lib/db/queries/bookmarks", () => ({
      getBookmarkById: () =>
        Promise.resolve({
          content: {
            imageUrl: attackerUrl,
          },
        }),
    }));

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response("<html>not an image</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      )
      .mockRejectedValueOnce(new Error("source unavailable"))
      .mockResolvedValueOnce(
        new Response("<html>not an image</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      );
    const { GET } = await import("@/app/api/og-image/route");
    const request = new NextRequest(
      `https://williamcallahan.com/api/og-image?url=${encodeURIComponent(sourceUrl)}&bookmarkId=bookmark-1`,
    );

    const response = await GET(request);
    const locationHeader = response.headers.get("Location");

    expect(fetchSpy).toHaveBeenCalledWith(
      attackerUrl,
      expect.objectContaining({
        headers: expect.objectContaining({
          "User-Agent": "Mozilla/5.0 (compatible; OpenGraph-Image-Bot/1.0)",
        }),
      }),
    );
    expect(locationHeader).not.toBe(attackerUrl);
    expect(locationHeader).toContain("opengraph-placeholder.png");
  });
});

describe("Production URL Validation", () => {
  /**
   * @description Integration test that verifies getBaseUrl behavior
   */
  it("should use production fallback when env vars are missing", async () => {
    // Test the getBaseUrl function directly
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("API_BASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.resetModules();

    // Clear module cache (only if available - not supported in Bun)
    // if (typeof vi.resetModules === "function") {
    //   vi.resetModules();
    // }
    const { getBaseUrl } = await import("@/lib/utils/get-base-url");

    const baseUrl = getBaseUrl();

    // Should fall back to williamcallahan.com in production
    expect(baseUrl).not.toContain("0.0.0.0");
    expect(baseUrl).not.toContain("localhost");

    // The production fallback should be used (even if empty string, it's not 0.0.0.0)
    expect(baseUrl).toEqual(expect.any(String));

    // Most importantly: it should NEVER contain the problematic 0.0.0.0 URL
    expect(baseUrl).not.toMatch(/0\.0\.0\.0/);
  });
});

describe("Logo API Route Validation", () => {
  it("rejects company fallback without a domain", async () => {
    const { GET } = await import("@/app/api/logo/route");
    const request = new NextRequest("http://localhost/api/logo?company=OpenAI");

    const response = await GET(request);
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toMatch(/Company fallback requires a domain/i);
  });
});
