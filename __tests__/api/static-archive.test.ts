// @vitest-environment node
import { NextRequest } from "next/server.js";
import { GET } from "@/app/api/static-archive/[...path]/route";

// Keep the real Next response implementation; only the framework request-context gate is stubbed.
vi.mock("next/server", async () => {
  const { NextResponse } = await import("next/server.js");
  return { NextResponse, connection: vi.fn<() => Promise<void>>(async () => {}) };
});
vi.mock("@/lib/utils/logger", () => ({
  default: { error: vi.fn<(message: string, ...args: unknown[]) => void>() },
}));

const origin = "https://archive.example.test";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_S3_CDN_URL", `${origin}/`);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function relay(asset: string) {
  return GET(
    new NextRequest(`https://site.example.test/_next/static/${asset}?dpl=older`, {
      headers: { cookie: "session=visitor", authorization: "Bearer visitor" },
    }),
    { params: Promise.resolve({ path: asset.split("/") }) },
  );
}

it.each([
  ["chunks/app/older.js", "application/javascript; charset=UTF-8"],
  ["chunks/older.css", "text/css; charset=UTF-8"],
  ["media/portrait.older.png", "image/png"],
  ["media/inter.older.woff2", "font/woff2"],
])(
  "relays archived %s byte-for-byte at its original key without forwarding visitor credentials",
  async (asset, type) => {
    const bytes = new Uint8Array([0, 255, 128, 10]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const request = new Request(input, init);
        expect(request.headers.get("cookie")).toBeNull();
        expect(request.headers.get("authorization")).toBeNull();
        // A wrong archive namespace answers a genuine miss, not the expected fixture.
        return request.url === `${origin}/_next/static/${asset}`
          ? new Response(bytes, { headers: { "content-type": type } })
          : new Response("Not Found", { status: 404 });
      }),
    );

    const response = await relay(asset);

    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get("content-type")).toBe(type);
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    if (asset.startsWith("media/")) {
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
    }
  },
);

it.each([403, 404])(
  "keeps missing legacy media truthful and uncacheable when the bucket answers %s",
  async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Absent", { status })),
    );

    const response = await relay("media/legacy.7a99237e.png");

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.text()).toBe("Not Found");
  },
);

it.each([
  "chunks/older.js.map",
  "chunks/sourcemaps/older.js",
  "chunks/secret.json",
  "media/font.woff2.map",
  "media/code.js",
  "media/png",
  "media/.private.png",
  "server/app/private.js",
  "build-id/_buildManifest.js",
  "media/../secret.png",
  "media/nested\\secret.png",
])("rejects non-public archive path %s without fetching the bucket", async (asset) => {
  const fetchArchive = vi.fn<typeof fetch>(async () => new Response("must not be exposed"));
  vi.stubGlobal("fetch", fetchArchive);

  const response = await relay(asset);

  expect(response.status).toBe(404);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(fetchArchive).not.toHaveBeenCalled();
});

it("does not cache an archive outage as a missing immutable asset", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("Unavailable", { status: 503 })),
  );

  const response = await relay("media/inter.older.woff2");

  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toContain("no-store");
});
