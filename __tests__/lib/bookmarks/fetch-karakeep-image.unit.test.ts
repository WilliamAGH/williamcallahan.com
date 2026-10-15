/**
 * @vitest-environment node
 */
import type { fetchKarakeepImage as FetchKarakeepImage } from "@/lib/bookmarks/enrich-opengraph";

vi.mock("@/lib/constants", async (importOriginal) => {
  const constants = await importOriginal<typeof import("@/lib/constants")>();
  return {
    ...constants,
    BOOKMARKS_API_CONFIG: { ...constants.BOOKMARKS_API_CONFIG, REQUEST_TIMEOUT_MS: 50 },
  };
});

function socketReset(): TypeError {
  return new TypeError("fetch failed", { cause: new Error("read ECONNRESET") });
}

describe("fetchKarakeepImage", () => {
  let fetchKarakeepImage: typeof FetchKarakeepImage;
  const errorLines: string[] = [];

  beforeAll(async () => {
    vi.stubEnv("BOOKMARK_BEARER_TOKEN", "test-token");
    vi.resetModules();
    ({ fetchKarakeepImage } = await import("@/lib/bookmarks/enrich-opengraph"));
  });

  beforeEach(() => {
    errorLines.length = 0;
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errorLines.push(args.map(String).join(" "));
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("returns the asset when a reset socket succeeds on retry, logging no error", async () => {
    const fetchStub = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(socketReset())
      .mockResolvedValueOnce(new Response(new Uint8Array(8000), { status: 200 }));
    vi.stubGlobal("fetch", fetchStub);

    const asset = await fetchKarakeepImage("asset-transient");

    expect(asset?.length).toBe(8000);
    expect(errorLines).toEqual([]);
  });

  it("returns the complete asset when a socket reset after headers succeeds on retry", async () => {
    const failure = new TypeError("terminated", {
      cause: Object.assign(new Error("other side closed"), { code: "UND_ERR_SOCKET" }),
    });
    const failedBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(failure);
      },
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(failedBody, { status: 200 }))
        .mockResolvedValueOnce(new Response(new Uint8Array(8000), { status: 200 })),
    );

    const asset = await fetchKarakeepImage("asset-body-reset");

    expect(asset?.length).toBe(8000);
    expect(errorLines).toEqual([]);
  });

  it("returns null with one final error when every successful response body stalls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
        const requestSignal = options?.signal;
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              requestSignal?.addEventListener(
                "abort",
                () => controller.error(requestSignal.reason),
                { once: true },
              );
            },
          }),
          { status: 200 },
        );
      }),
    );

    const asset = await fetchKarakeepImage("asset-body-stall");

    expect(asset).toBeNull();
    expect(errorLines).toHaveLength(1);
    expect(errorLines[0]).toContain("timeout");
  });

  it("logs a persistent failure as one line that names its cause", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(socketReset()));

    const asset = await fetchKarakeepImage("asset-persistent");

    expect(asset).toBeNull();
    expect(errorLines).toEqual([
      "[fetchKarakeepImage] Error fetching asset asset-persistent: fetch failed (cause: read ECONNRESET)",
    ]);
  });
});
