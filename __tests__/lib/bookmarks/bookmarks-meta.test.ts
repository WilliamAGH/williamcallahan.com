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

const mockBookmarks: UnifiedBookmark[] = [
  {
    id: "1",
    url: "https://example.com",
    title: "Example",
    description: "Test bookmark",
    tags: ["test"],
    imageUrl: null,
    domain: "example.com",
    createdAt: "2024-01-01",
    updatedAt: "2024-01-01",
    isFavorite: false,
  },
];

describe("Bookmarks Data Access (Simple)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (ServerCacheInstance.getBookmarks as jest.Mock).mockReturnValue(undefined);
    (ServerCacheInstance.shouldRefreshBookmarks as jest.Mock).mockReturnValue(true);
  });

  describe("Basic Functionality", () => {
    it("should return cached bookmarks when fresh", async () => {
      const cachedData = {
        bookmarks: mockBookmarks,
        lastFetchedAt: Date.now(),
        lastAttemptedAt: Date.now(),
      };

      (ServerCacheInstance.getBookmarks as jest.Mock).mockReturnValue(cachedData);
      (ServerCacheInstance.shouldRefreshBookmarks as jest.Mock).mockReturnValue(false);

      const result = await getBookmarks();

      expect(result).toEqual(mockBookmarks);
      expect(readJsonS3).not.toHaveBeenCalled();
    });

    it("should fetch from S3 when no cache", async () => {
      (ServerCacheInstance.getBookmarks as jest.Mock).mockReturnValue(undefined);
      (readJsonS3 as jest.Mock).mockResolvedValue(mockBookmarks);

      const result = await getBookmarks(true); // Skip external fetch

      expect(result).toEqual(mockBookmarks);
      expect(readJsonS3).toHaveBeenCalledWith(BOOKMARKS_S3_PATHS.FILE);
      expect(ServerCacheInstance.setBookmarks).toHaveBeenCalledWith(mockBookmarks);
    });

    it("should return empty array when no data available", async () => {
      (ServerCacheInstance.getBookmarks as jest.Mock).mockReturnValue(undefined);
      (readJsonS3 as jest.Mock).mockRejectedValue(new Error("Not found"));

      const result = await getBookmarks(true); // Skip external fetch

      expect(result).toEqual([]);
    });

    it("should handle S3 errors gracefully", async () => {
      (ServerCacheInstance.getBookmarks as jest.Mock).mockReturnValue(undefined);
      (readJsonS3 as jest.Mock).mockRejectedValue(new Error("S3 Error"));

      const result = await getBookmarks(true);

      expect(result).toEqual([]);
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

      const cachedData = {
        bookmarks: [{ invalid: "data" }],
        lastFetchedAt: Date.now(),
        lastAttemptedAt: Date.now(),
      };

      (ServerCacheInstance.getBookmarks as jest.Mock).mockReturnValue(cachedData);
      (ServerCacheInstance.shouldRefreshBookmarks as jest.Mock).mockReturnValue(false);
      (readJsonS3 as jest.Mock).mockResolvedValue(mockBookmarks);

      const result = await getBookmarks();

      expect(result).toEqual(mockBookmarks);
      expect(validateBookmarksDataset).toHaveBeenCalled();
    });

    it("should validate S3 data", async () => {
      const { validateBookmarksDataset } = await import("@/lib/validators/bookmarks");

      (ServerCacheInstance.getBookmarks as jest.Mock).mockReturnValue(undefined);
      (readJsonS3 as jest.Mock).mockResolvedValue(mockBookmarks);

      // Reset and setup validation to return true
      validateBookmarksDataset.mockReset();
      validateBookmarksDataset.mockReturnValue({ isValid: true });

      const result = await getBookmarks(true);

      expect(result).toEqual(mockBookmarks);
      expect(validateBookmarksDataset).toHaveBeenCalledWith(mockBookmarks);
    });
  });
});
