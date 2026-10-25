// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/logo/route";
import type { UnifiedImageService } from "@/lib/services/unified-image-service";
import type { LogoFetchResult } from "@/types/cache";
import logger from "@/lib/utils/logger";

// Use the installed response implementation, not the global lightweight route mock.
vi.mock("next/server", async () => ({
  ...(await import("next/dist/server/web/spec-extension/request")),
  ...(await import("next/dist/server/web/spec-extension/response")),
}));

const { getLogo } = vi.hoisted(() => ({ getLogo: vi.fn<UnifiedImageService["getLogo"]>() }));
vi.mock("@/lib/services/unified-image-service", () => ({
  getUnifiedImageService: () => ({ getLogo }),
}));

const cdnUrl = "https://s3-storage.callahan.cloud/images/logos/example_com_google_12345678.png";
const imageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const request = () => new NextRequest("https://williamcallahan.com/api/logo?website=example.com");

describe("Logo image delivery", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_S3_CDN_URL", "https://s3-storage.callahan.cloud");
    getLogo.mockReset();
    getLogo.mockResolvedValue({ cdnUrl, source: "google", contentType: "image/png" });
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(imageBytes, { headers: { "Content-Type": "image/png" } })),
    );
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    vi.spyOn(logger, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each([
    { name: "persisted CDN URL", metadata: { cdnUrl, source: "google", contentType: "image/png" } },
    {
      name: "persisted S3 key",
      metadata: {
        s3Key: "images/logos/example_com_google_12345678.png",
        source: "google",
        contentType: "image/png",
      },
    },
  ] satisfies { name: string; metadata: LogoFetchResult }[])(
    "serves $name as image bytes rather than a redirect",
    async ({ metadata }) => {
      getLogo.mockResolvedValue(metadata);

      const response = await GET(request());

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("content-type")).toBe("image/png");
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(imageBytes);
      expect(response.headers.get("cache-control")).toContain("public");
      expect(response.headers.get("cdn-cache-control")).toContain("immutable");
    },
  );

  it.each([302, 503])("does not cache upstream HTTP %i as an image", async (status) => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status }));

    const response = await GET(request());

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("cdn-cache-control")).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("bounds a stalled upstream fetch and leaves its error uncacheable", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );

    const pending = GET(request());
    await vi.advanceTimersByTimeAsync(10_000);
    const response = await pending;

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("cdn-cache-control")).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("preserves the missing-logo response without immutable error caching", async () => {
    getLogo.mockResolvedValue({ source: null, contentType: "image/png", error: "No logo found" });

    const response = await GET(request());

    expect(response.status).toBe(404);
    expect(response.headers.get("x-logo-domain")).toBe("example.com");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("cdn-cache-control")).toBeNull();
  });
});
