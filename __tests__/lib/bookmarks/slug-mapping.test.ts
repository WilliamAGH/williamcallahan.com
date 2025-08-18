/**
 * Test suite for bookmark slug mapping functionality
 */

import {
  generateSlugMapping,
  saveSlugMapping,
  loadSlugMapping,
  getSlugForBookmark,
  getBookmarkIdFromSlug,
} from "@/lib/bookmarks/slug-manager";
import { readJsonS3, writeJsonS3 } from "@/lib/s3-utils";
import { BOOKMARKS_S3_PATHS } from "@/lib/constants";
import type { UnifiedBookmark, BookmarkSlugMapping } from "@/types";

// Mock dependencies
jest.mock("@/lib/s3-utils");
jest.mock("@/lib/utils/logger");
jest.mock("node:fs", () => ({
  promises: {
    readFile: jest.fn().mockRejectedValue(new Error("File not found")),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
  },
}));

const mockReadJsonS3 = readJsonS3 as jest.MockedFunction<typeof readJsonS3>;
const mockWriteJsonS3 = writeJsonS3 as jest.MockedFunction<typeof writeJsonS3>;

describe("Bookmark Slug Mapping", () => {
  const mockBookmarks: UnifiedBookmark[] = [
    {
      id: "bookmark1",
      url: "https://example.com",
      title: "Example Site",
      description: "An example website for testing",
      tags: [],
      domain: "example.com",
      dateBookmarked: "2024-01-01",
      sourceUpdatedAt: "2024-01-01T00:00:00Z",
      summary: "",
      note: "",
    },
    {
      id: "bookmark2",
      url: "https://github.com/user/repo",
      title: "GitHub Repo",
      description: "A GitHub repository",
      tags: [],
      domain: "github.com",
      dateBookmarked: "2024-01-02",
      sourceUpdatedAt: "2024-01-02T00:00:00Z",
      summary: "",
      note: "",
    },
    {
      id: "bookmark3",
      url: "https://example.com",
      title: "Example Site Again",
      description: "Another example website for testing duplicates",
      tags: [],
      domain: "example.com",
      dateBookmarked: "2024-01-03",
      sourceUpdatedAt: "2024-01-03T00:00:00Z",
      summary: "",
      note: "",
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("generateSlugMapping", () => {
    it("should generate unique slugs for all bookmarks", () => {
      const mapping = generateSlugMapping(mockBookmarks);

      expect(mapping.count).toBe(3);
      expect(Object.keys(mapping.slugs)).toHaveLength(3);
      expect(Object.keys(mapping.reverseMap)).toHaveLength(3);

      // Check each bookmark has a slug
      expect(mapping.slugs.bookmark1).toBeDefined();
      expect(mapping.slugs.bookmark2).toBeDefined();
      expect(mapping.slugs.bookmark3).toBeDefined();
    });

    it("should handle duplicate domains with numeric suffixes", () => {
      const mapping = generateSlugMapping(mockBookmarks);

      // Both example.com bookmarks should have different slugs
      const slug1 = mapping.slugs.bookmark1.slug;
      const slug3 = mapping.slugs.bookmark3.slug;

      expect(slug1).not.toBe(slug3);
      expect(slug1).toContain("example-com");
      expect(slug3).toContain("example-com");

      // One should have a numeric suffix
      const suffixRegex = /-\d+$/;
      const hasSuffix = suffixRegex.test(slug1) || suffixRegex.test(slug3);
      expect(hasSuffix).toBe(true);
    });

    it("should create bidirectional mapping", () => {
      const mapping = generateSlugMapping(mockBookmarks);

      // For each slug in slugs, there should be a reverse mapping
      for (const [bookmarkId, entry] of Object.entries(mapping.slugs)) {
        expect(mapping.reverseMap[entry.slug]).toBe(bookmarkId);
      }
    });

    it("should be deterministic", () => {
      const mapping1 = generateSlugMapping(mockBookmarks);
      const mapping2 = generateSlugMapping(mockBookmarks);

      // The generated timestamp can be flaky, so we compare the important parts.
      expect(mapping1.count).toEqual(mapping2.count);
      expect(mapping1.slugs).toEqual(mapping2.slugs);
      expect(mapping1.reverseMap).toEqual(mapping2.reverseMap);
    });

    it("should handle empty bookmarks array", () => {
      const mapping = generateSlugMapping([]);

      expect(mapping.count).toBe(0);
      expect(Object.keys(mapping.slugs)).toHaveLength(0);
      expect(Object.keys(mapping.reverseMap)).toHaveLength(0);
    });
  });

  describe("saveSlugMapping", () => {
    it("should save mapping to S3 with correct path", async () => {
      mockWriteJsonS3.mockResolvedValue(undefined);

      // Call with default overwrite=true, which doesn't pass IfNoneMatch
      await saveSlugMapping(mockBookmarks);

      expect(mockWriteJsonS3).toHaveBeenCalledWith(
        BOOKMARKS_S3_PATHS.SLUG_MAPPING,
        expect.objectContaining({
          version: "1.0.0",
          count: 3,
          slugs: expect.any(Object),
          reverseMap: expect.any(Object),
          generated: expect.any(String),
        }),
      );
    });

    it("should use environment-aware path", () => {
      // Since Jest config sets testEnvironmentOptions.url to localhost:3000,
      // the environment detection will return "development" even in test mode
      const expectedSuffix = "-dev";

      expect(BOOKMARKS_S3_PATHS.SLUG_MAPPING).toContain(`slug-mapping${expectedSuffix}.json`);
    });

    it("should throw error on S3 write failure", async () => {
      mockWriteJsonS3.mockRejectedValue(new Error("S3 Error"));

      await expect(saveSlugMapping(mockBookmarks)).rejects.toThrow("S3 Error");
    });
  });

  describe("loadSlugMapping", () => {
    const mockMapping: BookmarkSlugMapping = {
      version: "1.0.0",
      generated: new Date().toISOString(),
      count: 2,
      slugs: {
        bookmark1: {
          id: "bookmark1",
          slug: "example-com",
          url: "https://example.com",
          title: "Example",
        },
        bookmark2: {
          id: "bookmark2",
          slug: "github-com",
          url: "https://github.com",
          title: "GitHub",
        },
      },
      reverseMap: {
        "example-com": "bookmark1",
        "github-com": "bookmark2",
      },
    };

    it("should load mapping from S3", async () => {
      mockReadJsonS3.mockResolvedValue(mockMapping);

      const result = await loadSlugMapping();

      expect(mockReadJsonS3).toHaveBeenCalledWith(BOOKMARKS_S3_PATHS.SLUG_MAPPING);
      expect(result).toEqual(mockMapping);
    });

    it("should return null on S3 read error", async () => {
      mockReadJsonS3.mockRejectedValue(new Error("Not found"));

      const result = await loadSlugMapping();

      expect(result).toBeNull();
    });
  });

  describe("getSlugForBookmark", () => {
    const mockMapping: BookmarkSlugMapping = {
      version: "1.0.0",
      generated: new Date().toISOString(),
      count: 1,
      slugs: {
        bookmark1: {
          id: "bookmark1",
          slug: "test-slug",
          url: "https://test.com",
          title: "Test",
        },
      },
      reverseMap: {
        "test-slug": "bookmark1",
      },
    };

    it("should return slug for existing bookmark", () => {
      const slug = getSlugForBookmark(mockMapping, "bookmark1");
      expect(slug).toBe("test-slug");
    });

    it("should return null for non-existent bookmark", () => {
      const slug = getSlugForBookmark(mockMapping, "unknown");
      expect(slug).toBeNull();
    });
  });

  describe("getBookmarkIdFromSlug", () => {
    const mockMapping: BookmarkSlugMapping = {
      version: "1.0.0",
      generated: new Date().toISOString(),
      count: 1,
      slugs: {
        bookmark1: {
          id: "bookmark1",
          slug: "test-slug",
          url: "https://test.com",
          title: "Test",
        },
      },
      reverseMap: {
        "test-slug": "bookmark1",
      },
    };

    it("should return bookmark ID for existing slug", () => {
      const id = getBookmarkIdFromSlug(mockMapping, "test-slug");
      expect(id).toBe("bookmark1");
    });

    it("should return null for non-existent slug", () => {
      const id = getBookmarkIdFromSlug(mockMapping, "unknown-slug");
      expect(id).toBeNull();
    });
  });

  describe("Idempotency", () => {
    it("should generate same slugs regardless of bookmark order", () => {
      const shuffled = [...mockBookmarks].reverse();

      const mapping1 = generateSlugMapping(mockBookmarks);
      const mapping2 = generateSlugMapping(shuffled);

      // Same bookmarks should get same slugs
      for (const bookmarkId of Object.keys(mapping1.slugs)) {
        expect(mapping1.slugs[bookmarkId].slug).toBe(mapping2.slugs[bookmarkId].slug);
      }
    });
  });
});
