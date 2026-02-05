/**
 * Tests for Bookmarks Data Access Layer
 *
 * Tests the bookmarks data access functions via mock to verify calling conventions.
 * For integration tests of real business logic, mock S3 instead.
 */
import { vi } from "vitest";
import type { UnifiedBookmark } from "@/types/bookmark";
import { S3NotFoundError } from "@/lib/s3/errors";

// Explicit mock - no alias hijacking
vi.mock("@/lib/bookmarks/bookmarks-data-access.server", () => ({
  getBookmarks: vi.fn(),
}));

vi.mock("@/lib/bookmarks/refresh-logic.server", () => ({
  setRefreshBookmarksCallback: vi.fn(),
}));

import { getBookmarks } from "@/lib/bookmarks/bookmarks-data-access.server";
import { setRefreshBookmarksCallback as setRefreshCallback } from "@/lib/bookmarks/refresh-logic.server";

const mockGetBookmarks = vi.mocked(getBookmarks);
const mockSetRefreshCallback = vi.mocked(setRefreshCallback);

const createTag = (name: string) => ({
  id: name,
  name,
  slug: name.replace(/\s+/g, "-"),
  color: undefined,
});

const mockBookmarks: UnifiedBookmark[] = [
  {
    id: "1",
    url: "https://example.com",
    title: "Example",
    description: "Test bookmark",
    tags: [createTag("test")],
    imageUrl: null,
    domain: "example.com",
    createdAt: "2024-01-01",
    updatedAt: "2024-01-01",
    isFavorite: false,
  } as UnifiedBookmark,
];

/** Helper to strip tag objects -> names for deep equality where expected data uses strings */
const simplify = (bookmarks: UnifiedBookmark[]) =>
  bookmarks.map((b) => ({ ...b, tags: b.tags.map((t) => (typeof t === "string" ? t : t.name)) }));

describe("Bookmarks Data Access (Simple)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Basic Functionality", () => {
    it("should return bookmarks from the mock", async () => {
      mockGetBookmarks.mockResolvedValueOnce(mockBookmarks);

      const result = await getBookmarks();

      expect(simplify(result)).toEqual(simplify(mockBookmarks));
      expect(mockGetBookmarks).toHaveBeenCalled();
    });

    it("should pass options to the mock", async () => {
      mockGetBookmarks.mockResolvedValueOnce(mockBookmarks);

      const result = await getBookmarks({ skipExternalFetch: true });

      expect(simplify(result)).toEqual(simplify(mockBookmarks));
      expect(mockGetBookmarks).toHaveBeenCalledWith({ skipExternalFetch: true });
    });

    it("should throw S3NotFoundError when mock rejects with S3NotFoundError", async () => {
      mockGetBookmarks.mockRejectedValueOnce(
        new S3NotFoundError({ key: "bookmarks.json", operation: "GetObject" }),
      );

      await expect(getBookmarks({ skipExternalFetch: true })).rejects.toThrow(S3NotFoundError);
    });

    it("should handle S3 errors", async () => {
      mockGetBookmarks.mockRejectedValueOnce(new Error("S3 Error"));

      await expect(getBookmarks({ skipExternalFetch: true })).rejects.toThrow("S3 Error");
    });

    it("should set refresh callback via refresh-logic", () => {
      const callback = vi.fn();
      setRefreshCallback(callback);
      expect(mockSetRefreshCallback).toHaveBeenCalledWith(callback);
    });
  });

  describe("Mock Configuration", () => {
    it("should allow configuring multiple sequential responses", async () => {
      mockGetBookmarks
        .mockResolvedValueOnce(mockBookmarks)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(mockBookmarks);

      const result1 = await getBookmarks();
      const result2 = await getBookmarks();
      const result3 = await getBookmarks();

      expect(result1).toHaveLength(1);
      expect(result2).toHaveLength(0);
      expect(result3).toHaveLength(1);
    });

    it("should track call count correctly", async () => {
      mockGetBookmarks.mockResolvedValue(mockBookmarks);

      await getBookmarks();
      await getBookmarks();
      await getBookmarks();

      expect(mockGetBookmarks).toHaveBeenCalledTimes(3);
    });
  });
});
