/**
 * IndexNow Submission Tests
 * @description The IndexNow request carries only sitemap URLs modified within
 * the last week that the ledger has not already recorded with the same
 * lastModified, and no request is sent when none changed.
 * @vitest-environment node
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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

  describe("with an announcement ledger", () => {
    let ledgerDir: string;
    let ledgerFilePath: string;

    beforeEach(async () => {
      ledgerDir = await mkdtemp(path.join(os.tmpdir(), "indexnow-ledger-test-"));
      ledgerFilePath = path.join(ledgerDir, "ledger.json");
    });

    afterEach(async () => {
      await rm(ledgerDir, { recursive: true, force: true });
    });

    const submit = () =>
      submitToIndexNow(SITE, KEY, `${KEY}.txt`, false, false, false, ledgerFilePath);

    it("records each accepted URL with the lastModified it was announced with", async () => {
      mockSitemap.mockResolvedValue([
        { url: `${SITE}blog/new-post`, lastModified: "2026-10-21T00:00:00-07:00" },
        { url: `${SITE}bookmarks`, lastModified: "2026-10-25T18:00:00.000Z" },
      ]);
      const submissions = stubNetwork();

      await submit();

      expect(submissions()).toEqual([
        expect.objectContaining({ urlList: [`${SITE}blog/new-post`, `${SITE}bookmarks`] }),
      ]);
      const ledger: unknown = JSON.parse(await readFile(ledgerFilePath, "utf8"));
      expect(ledger).toEqual({
        [`${SITE}blog/new-post`]: "2026-10-21T07:00:00.000Z",
        [`${SITE}bookmarks`]: "2026-10-25T18:00:00.000Z",
      });
    });

    it("sends no IndexNow request when every recent URL is already announced", async () => {
      mockSitemap.mockResolvedValue([
        { url: `${SITE}blog/new-post`, lastModified: "2026-10-21T00:00:00-07:00" },
      ]);
      stubNetwork();
      await submit();
      const submissions = stubNetwork();

      await submit();

      expect(submissions()).toEqual([]);
    });

    it("re-announces only the URL whose lastModified advanced", async () => {
      mockSitemap.mockResolvedValue([
        { url: `${SITE}blog/new-post`, lastModified: "2026-10-21T00:00:00-07:00" },
        { url: `${SITE}bookmarks`, lastModified: "2026-10-25T16:00:00.000Z" },
      ]);
      stubNetwork();
      await submit();
      mockSitemap.mockResolvedValue([
        { url: `${SITE}blog/new-post`, lastModified: "2026-10-21T00:00:00-07:00" },
        { url: `${SITE}bookmarks`, lastModified: "2026-10-25T18:00:00.000Z" },
      ]);
      const submissions = stubNetwork();

      await submit();

      expect(submissions()).toEqual([expect.objectContaining({ urlList: [`${SITE}bookmarks`] })]);
    });
  });
});
