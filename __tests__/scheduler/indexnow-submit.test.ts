/**
 * IndexNow Submission Tests
 * @description The IndexNow request carries only sitemap URLs modified within
 * the last week, and no request is sent when none changed.
 * @vitest-environment node
 */

import type { MetadataRoute } from "next";
import sitemap from "@/app/sitemap";
import { submitToIndexNow } from "../../scheduler/lib/indexnow-submit";

vi.mock("@/app/sitemap", () => ({
  default: vi.fn<() => Promise<MetadataRoute.Sitemap>>(),
}));

const mockSitemap = vi.mocked(sitemap);
const SITE = "https://williamcallahan.com/";
const KEY = "0123456789abcdef0123456789abcdef";
const NOW = new Date("2026-10-25T19:00:00.000Z");

function stubNetwork() {
  const fetchMock = vi.fn<typeof fetch>((input: Parameters<typeof fetch>[0]) =>
    Promise.resolve(
      String(input).endsWith(`${KEY}.txt`)
        ? new Response(KEY)
        : new Response(null, { status: 200 }),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  return () =>
    fetchMock.mock.calls
      .filter(([input]) => String(input).includes("indexnow"))
      .map(([, init]): unknown => JSON.parse(String(init?.body)));
}

describe("submitToIndexNow", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("announces only sitemap URLs modified within the last week", async () => {
    mockSitemap.mockResolvedValue([
      // A date-only frontmatter value resolves to Pacific midnight, days before its deploy.
      { url: `${SITE}blog/new-post`, lastModified: "2026-10-21T00:00:00-07:00" },
      { url: `${SITE}blog/old-post`, lastModified: "2026-09-01T00:00:00-07:00" },
      { url: `${SITE}contact` },
    ]);
    const submissions = stubNetwork();

    await submitToIndexNow(SITE, KEY, `${KEY}.txt`, false, false);

    expect(submissions()).toEqual([expect.objectContaining({ urlList: [`${SITE}blog/new-post`] })]);
  });

  it("sends no IndexNow request when no sitemap URL changed within the last week", async () => {
    mockSitemap.mockResolvedValue([
      { url: `${SITE}blog/old-post`, lastModified: "2026-09-01T00:00:00-07:00" },
    ]);
    const submissions = stubNetwork();

    await submitToIndexNow(SITE, KEY, `${KEY}.txt`, false, false);

    expect(submissions()).toEqual([]);
  });
});
