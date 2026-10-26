// @vitest-environment node
import sitemap from "../../src/app/sitemap";
import { IndexNowSubmissionError, submitToIndexNow } from "../../scheduler/lib/indexnow-submit";

vi.mock("../../src/app/sitemap", () => ({ default: vi.fn<typeof sitemap>() }));

// Synthetic public verification token, never a configured credential.
const KEY = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SITE = "https://williamcallahan.com/";
const requests: Request[] = [];
let providerStatuses: number[];
let verificationStatus: number;
let verificationBody: string;

beforeEach(() => {
  requests.length = 0;
  providerStatuses = [200];
  verificationStatus = 200;
  verificationBody = KEY;
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.mocked(sitemap).mockResolvedValue([
    { url: `${SITE}blog/recent`, lastModified: new Date() },
    { url: `${SITE}blog/old`, lastModified: "2020-01-01" },
    { url: `${SITE}undated` },
  ]);
  // Native Request/Response transport fixture: any attempted HTTP request is recorded,
  // and no network (including Google) is reachable through this boundary.
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      if (request.method === "GET") {
        return new Response(verificationBody, { status: verificationStatus });
      }
      return new Response(null, { status: providerStatuses.shift() ?? 500 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("dry-run selects the recent canonical inventory without credentials or any HTTP requests", async () => {
  await submitToIndexNow(SITE, "", "", false, true, true);
  expect(requests).toEqual([]);
  expect(console.info).toHaveBeenCalledWith(
    "[IndexNow] Dry run: selected 1 URLs for williamcallahan.com.",
  );
});

it("retains the concurrent seven-day announcement window without resubmitting older URLs", async () => {
  const day = 24 * 60 * 60 * 1000;
  vi.mocked(sitemap).mockResolvedValue([
    { url: `${SITE}blog/deployed-later`, lastModified: new Date(Date.now() - 6 * day) },
    { url: `${SITE}blog/outside-window`, lastModified: new Date(Date.now() - 8 * day) },
  ]);
  await submitToIndexNow(SITE, KEY, `${KEY}.txt`, false, false);
  const submission = requests.find((request) => request.method === "POST");
  if (!submission) throw new Error("Missing IndexNow submission");
  const payload: unknown = await submission.json();
  expect(payload).toMatchObject({ urlList: [`${SITE}blog/deployed-later`] });
});

it.each([200, 202])(
  "treats HTTP %i as accepted and sends only recent sitemap URLs",
  async (status) => {
    providerStatuses = [status];
    await expect(submitToIndexNow(SITE, KEY, `${KEY}.txt`, false, true)).resolves.toBeUndefined();
    expect(requests.map((request) => [request.method, request.url])).toEqual([
      ["GET", `${SITE}${KEY}.txt`],
      ["POST", "https://api.indexnow.org/indexnow"],
    ]);
    const submission = requests.find((request) => request.method === "POST");
    if (!submission) throw new Error("Missing IndexNow submission");
    const payload: unknown = await submission.json();
    expect(payload).toEqual({
      host: "williamcallahan.com",
      key: KEY,
      keyLocation: `${SITE}${KEY}.txt`,
      urlList: [`${SITE}blog/recent`],
    });
  },
);

it("propagates a provider rejection instead of reporting completion", async () => {
  providerStatuses = [422];
  await expect(submitToIndexNow(SITE, KEY, `${KEY}.txt`, false, false)).rejects.toThrow(
    "IndexNow submission rejected with HTTP 422.",
  );
});

it("preserves the existing 403 fallback and propagates its rejection", async () => {
  providerStatuses = [403, 429];
  await expect(submitToIndexNow(SITE, KEY, `${KEY}.txt`, false, false)).rejects.toThrow(
    "IndexNow submission rejected with HTTP 429.",
  );
  expect(
    requests.filter((request) => request.method === "POST").map((request) => request.url),
  ).toEqual(["https://api.indexnow.org/indexnow", "https://www.bing.com/indexnow"]);
});

it.each(["status", "mismatch"])("fails key verification (%s) before any POST", async (failure) => {
  if (failure === "status") verificationStatus = 404;
  else verificationBody = "wrong verification content";
  await expect(submitToIndexNow(SITE, KEY, `${KEY}.txt`, false, false)).rejects.toBeInstanceOf(
    IndexNowSubmissionError,
  );
  expect(requests.map((request) => request.method)).toEqual(["GET"]);
});

it("keeps malformed configuration distinct from a provider rejection", async () => {
  await expect(
    submitToIndexNow(SITE, "invalid", "invalid.txt", false, false),
  ).rejects.toBeInstanceOf(TypeError);
  expect(requests).toEqual([]);
});
