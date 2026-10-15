/**
 * @vitest-environment node
 */
import type { fetchKarakeepImage as FetchKarakeepImage } from "@/lib/bookmarks/enrich-opengraph";

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

  it("logs a persistent failure as one line that names its cause", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(socketReset()));

    const asset = await fetchKarakeepImage("asset-persistent");

    expect(asset).toBeNull();
    expect(errorLines).toEqual([
      "[fetchKarakeepImage] Error fetching asset asset-persistent: fetch failed (cause: read ECONNRESET)",
    ]);
  });
});
