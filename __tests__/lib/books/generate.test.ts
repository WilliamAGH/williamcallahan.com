/** @vitest-environment node */

import { generateBooksDataset } from "@/lib/books/generate";
import {
  fetchBooks,
  fetchBooksWithFallback,
  fetchBookListItems,
  fetchBookListItemsWithFallback,
} from "@/lib/books/audiobookshelf.server";
import { writeBooksSnapshot } from "@/lib/db/mutations/books";
import type { writeBooksSnapshot as WriteBooksSnapshot } from "@/lib/db/mutations/books";
import type { readBooksLatestPointer as ReadBooksLatestPointer } from "@/lib/db/queries/books";
import type { getCachedAnalysis as GetCachedAnalysis } from "@/lib/ai-analysis/reader.server";
import type { applyBookCoverBlurs as ApplyBookCoverBlurs } from "@/lib/books/image-utils.server";

vi.mock("@/lib/db/mutations/books", () => ({
  writeBooksSnapshot: vi.fn<typeof WriteBooksSnapshot>(),
}));
vi.mock("@/lib/db/queries/books", () => ({
  readBooksLatestPointer: vi.fn<typeof ReadBooksLatestPointer>(),
}));
vi.mock("@/lib/ai-analysis/reader.server", () => ({
  getCachedAnalysis: vi.fn<typeof GetCachedAnalysis>(),
}));
vi.mock("@/lib/books/image-utils.server", () => ({
  applyBookCoverBlurs: vi.fn<typeof ApplyBookCoverBlurs>(),
}));

describe("ABS books generation outcomes", () => {
  beforeEach(() => {
    vi.stubEnv("AUDIOBOOKSHELF_URL", "https://abs.example.com");
    vi.stubEnv("AUDIOBOOKSHELF_API_KEY", "test-api-key");
    vi.stubEnv("AUDIOBOOKSHELF_LIBRARY_ID", "test-library");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("reports a failed ABS request as failure and leaves the persisted dataset untouched", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 503, statusText: "Service Unavailable" }),
    );
    const errorOutput = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await generateBooksDataset({ books: true });

    expect(result).toMatchObject({
      success: false,
      operation: "books",
      error: "AudioBookShelf API error: 503 Service Unavailable",
    });
    expect(writeBooksSnapshot).not.toHaveBeenCalled();
    expect(errorOutput).toHaveBeenCalledWith(
      expect.stringContaining("[ERROR] [Books]"),
      expect.any(Error),
    );
    expect(errorOutput).toHaveBeenCalledWith(
      expect.stringContaining("Error: AudioBookShelf API error: 503 Service Unavailable"),
      expect.any(Error),
    );
  });

  it("keeps a successful empty ABS library a valid no-op", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ results: [], total: 0, limit: 0, page: 0 }),
    );

    const result = await generateBooksDataset({ books: true });

    expect(result).toMatchObject({ success: true, operation: "books", itemsProcessed: 0 });
    expect(result.error).toBeUndefined();
    expect(writeBooksSnapshot).not.toHaveBeenCalled();
  });

  it("retains the original fetch error and cause in the explicit failure result", async () => {
    const cause = new Error("connection refused");
    const failure = new TypeError("fetch failed", { cause });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(failure);
    const errorOutput = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await fetchBooksWithFallback({ allowStale: false });

    expect(result).toMatchObject({ books: [], isFallback: true, fetchedAt: 0 });
    expect(result.error).toBe(failure);
    expect(result.error?.cause).toBe(cause);
    expect(errorOutput).toHaveBeenCalledWith(expect.stringContaining("[ERROR] [Books]"), failure);
  });

  it.each([
    { name: "full books", fetch: fetchBooks },
    { name: "book list", fetch: fetchBookListItems },
  ])(
    "rejects $name array reads with the original source error instead of returning []",
    async ({ fetch }) => {
      const failure = new TypeError("ABS connection failed", {
        cause: new Error("connection refused"),
      });
      vi.spyOn(globalThis, "fetch").mockRejectedValue(failure);

      await expect(fetch()).rejects.toBe(failure);
    },
  );

  it.each([
    { name: "full books", fetch: fetchBooks },
    { name: "book list", fetch: fetchBookListItems },
  ])("preserves successful empty $name array reads", async ({ fetch }) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ results: [], total: 0, limit: 0, page: 0 }),
    );

    await expect(fetch()).resolves.toEqual([]);
  });

  it("keeps the list WithFallback API graceful while retaining its source failure", async () => {
    const failure = new Error("ABS unavailable");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(failure);

    const result = await fetchBookListItemsWithFallback();

    expect(result).toMatchObject({ books: [], isFallback: true, fetchedAt: 0 });
    expect(result.error).toBe(failure);
  });
});
