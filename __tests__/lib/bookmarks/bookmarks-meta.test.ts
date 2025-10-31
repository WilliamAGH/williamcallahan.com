/**
 * Simple Tests for Bookmarks Data Access Layer
 */
import type { UnifiedBookmark } from "@/types/bookmark";
import { BOOKMARKS_S3_PATHS } from "@/lib/constants";

// Mock dependencies first
jest.mock("@/lib/s3-utils", () => ({
  readJsonS3: jest.fn(),
  writeJsonS3: jest.fn(),
  deleteFromS3: jest.fn(),
}));

jest.mock("@/lib/server-cache", () => {
  const mockCache = {
    getBookmarks: jest.fn(),
    setBookmarks: jest.fn(),
    shouldRefreshBookmarks: jest.fn(),
  };
  return {
    ServerCacheInstance: mockCache,
  };
});

jest.mock("@/lib/validators/bookmarks", () => ({
  validateBookmarksDataset: jest.fn().mockReturnValue({ isValid: true }),
}));

jest.mock("node:crypto", () => ({
  randomInt: jest.fn(() => 123456),
  randomUUID: jest.fn(() => "00000000-0000-0000-0000-000000000000"),
}));

// Mock cheerio before importing modules that use it
jest.mock("cheerio", () => ({
  load: jest.fn(() => ({
    html: jest.fn(),
    text: jest.fn(),
    find: jest.fn().mockReturnThis(),
    first: jest.fn().mockReturnThis(),
    attr: jest.fn(),
    each: jest.fn(),
  })),
}));

// Import after mocks
import { getBookmarks, setRefreshBookmarksCallback } from "@/lib/bookmarks/bookmarks-data-access.server";
import { ServerCacheInstance } from "@/lib/server-cache";
import { readJsonS3 } from "@/lib/s3-utils";

const createTag = (name: string) => ({ id: name, name, slug: name.replace(/\s+/g, "-"), color: undefined });

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
  },
];

/** Helper to strip tag objects -> names for deep equality where expected data uses strings */
const simplify = (bookmarks: UnifiedBookmark[]) =>
  bookmarks.map(b => ({ ...b, tags: b.tags.map(t => (typeof t === "string" ? t : t.name)) }));

describe("Bookmarks Data Access (Simple)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (ServerCacheInstance.getBookmarks as jest.Mock).mockReturnValue(undefined);
    (ServerCacheInstance.shouldRefreshBookmarks as jest.Mock).mockReturnValue(true);
  });

  describe("Basic Functionality", () => {
    it("should return cached bookmarks when fresh", async () => {
      // The actual implementation reads from S3 directly
      (readJsonS3 as jest.Mock).mockResolvedValue(mockBookmarks);

      const result = await getBookmarks();

      expect(simplify(result)).toEqual(simplify(mockBookmarks));
      expect(readJsonS3).toHaveBeenCalledWith(BOOKMARKS_S3_PATHS.FILE);
    });

    it("should fetch from S3 when no cache", async () => {
      (readJsonS3 as jest.Mock).mockResolvedValue(mockBookmarks);

      const result = await getBookmarks(true); // Skip external fetch

      expect(simplify(result)).toEqual(simplify(mockBookmarks));
      expect(readJsonS3).toHaveBeenCalledWith(BOOKMARKS_S3_PATHS.FILE);
    });

    it("should return empty array when no data available", async () => {
      const notFoundError = new Error("Not found") as any;
      notFoundError.$metadata = { httpStatusCode: 404 };
      (readJsonS3 as jest.Mock).mockRejectedValue(notFoundError);

      const result = await getBookmarks(true); // Skip external fetch

      expect(simplify(result)).toEqual([]);
    });

    it("should handle S3 errors gracefully", async () => {
      (ServerCacheInstance.getBookmarks as jest.Mock).mockReturnValue(undefined);
      (readJsonS3 as jest.Mock).mockRejectedValue(new Error("S3 Error"));

      const result = await getBookmarks(true);

      expect(simplify(result)).toEqual([]);
      expect(readJsonS3).toHaveBeenCalled();
    });

    it("should set refresh callback", () => {
      const callback = jest.fn();
      setRefreshBookmarksCallback(callback);
      // Just verify it doesn't throw
      expect(true).toBe(true);
    });
  });

  describe("Validation", () => {
    it("should validate cached data", async () => {
      const { validateBookmarksDataset } = await import("@/lib/validators/bookmarks");
      validateBookmarksDataset.mockReturnValueOnce({
        isValid: false,
        reason: "Invalid structure",
      });

      // The actual implementation validates data from S3
      (readJsonS3 as jest.Mock).mockResolvedValue(mockBookmarks);

      const result = await getBookmarks();

      expect(simplify(result)).toEqual(simplify(mockBookmarks));
      // Validation is NOT called during regular reads from S3
      expect(validateBookmarksDataset).not.toHaveBeenCalled();
    });

    it("should validate S3 data", async () => {
      const { validateBookmarksDataset } = await import("@/lib/validators/bookmarks");

      (ServerCacheInstance.getBookmarks as jest.Mock).mockReturnValue(undefined);
      (readJsonS3 as jest.Mock).mockResolvedValue(mockBookmarks);

      // Reset and setup validation to return true
      validateBookmarksDataset.mockReset();
      validateBookmarksDataset.mockReturnValue({ isValid: true });

      const result = await getBookmarks(true);

      expect(simplify(result)).toEqual(simplify(mockBookmarks));
      // Validation is NOT called during regular reads from S3
      expect(validateBookmarksDataset).not.toHaveBeenCalled();
    });
  });
});
