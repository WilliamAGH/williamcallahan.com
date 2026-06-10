/**
 * @file Unit tests for bookmarks validation logic.
 * This file tests the validation functions in lib/validators/bookmarks.ts to ensure
 * they correctly identify invalid datasets such as single test bookmarks or bookmarks
 * missing URLs.
 * @module __tests__/lib/bookmarks-validation.test
 */

import { validateBookmarksDataset } from "../../../src/lib/validators/bookmarks";
import { bookmarksApiResponseSchema } from "../../../src/types/schemas/bookmark";
import type { UnifiedBookmark } from "../../../src/types/schemas/bookmark";

// Mock console.error to suppress error logs during tests
vi.spyOn(console, "error").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});

describe("Bookmarks Validation", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear mock calls before each test
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    // Reset process.env to prevent cross-test bleed
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  const createBookmark = (id: string, url: string, title: string): UnifiedBookmark => ({
    id,
    url,
    title,
    description: "A valid bookmark",
    slug: id,
    tags: [],
    dateBookmarked: "2023-01-01T00:00:00Z",
    sourceUpdatedAt: "2023-01-01T00:00:00Z",
    dateCreated: "2023-01-01T00:00:00Z",
    modifiedAt: "2023-01-01T00:00:00Z",
    archived: false,
    isFavorite: false,
    taggingStatus: "complete",
    content: {
      type: "link",
      url,
      title,
      description: "A valid bookmark",
    },
    assets: [],
  });

  test("should validate a normal dataset with multiple bookmarks", () => {
    const bookmarks: UnifiedBookmark[] = [
      {
        id: "1",
        url: "https://example.com",
        title: "Example",
        description: "An example bookmark",
        slug: "example",
        tags: [],
        dateBookmarked: "2023-01-01T00:00:00Z",
        sourceUpdatedAt: "2023-01-01T00:00:00Z",
        dateCreated: "2023-01-01T00:00:00Z",
        modifiedAt: "2023-01-01T00:00:00Z",
        archived: false,
        isFavorite: false,
        taggingStatus: "complete",
        content: {
          type: "link",
          url: "https://example.com",
          title: "Example",
          description: "An example bookmark",
        },
        assets: [],
      },
      {
        id: "2",
        url: "https://test.com",
        title: "Test Site",
        description: "A test site",
        slug: "test-site",
        tags: [],
        dateBookmarked: "2023-01-02T00:00:00Z",
        sourceUpdatedAt: "2023-01-02T00:00:00Z",
        dateCreated: "2023-01-02T00:00:00Z",
        modifiedAt: "2023-01-02T00:00:00Z",
        archived: false,
        isFavorite: false,
        taggingStatus: "complete",
        content: {
          type: "link",
          url: "https://test.com",
          title: "Test Site",
          description: "A test site",
        },
        assets: [],
      },
    ];

    const result = validateBookmarksDataset(bookmarks);
    expect(result.isValid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  test("should fall back to default minimum when MIN_BOOKMARKS_THRESHOLD is invalid", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.MIN_BOOKMARKS_THRESHOLD = "invalid";

    const bookmarks = [
      createBookmark("1", "https://example.com/1", "Bookmark 1"),
      createBookmark("2", "https://example.com/2", "Bookmark 2"),
      createBookmark("3", "https://example.com/3", "Bookmark 3"),
      createBookmark("4", "https://example.com/4", "Bookmark 4"),
      createBookmark("5", "https://example.com/5", "Bookmark 5"),
    ];

    const result = validateBookmarksDataset(bookmarks);
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain("minimum expected is 10");
    expect(console.warn).toHaveBeenCalled();
  });

  test("should fall back to default minimum when MIN_BOOKMARKS_THRESHOLD is non-positive", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.MIN_BOOKMARKS_THRESHOLD = "0";

    const bookmarks = [
      createBookmark("1", "https://example.com/1", "Bookmark 1"),
      createBookmark("2", "https://example.com/2", "Bookmark 2"),
      createBookmark("3", "https://example.com/3", "Bookmark 3"),
      createBookmark("4", "https://example.com/4", "Bookmark 4"),
      createBookmark("5", "https://example.com/5", "Bookmark 5"),
      createBookmark("6", "https://example.com/6", "Bookmark 6"),
      createBookmark("7", "https://example.com/7", "Bookmark 7"),
      createBookmark("8", "https://example.com/8", "Bookmark 8"),
      createBookmark("9", "https://example.com/9", "Bookmark 9"),
    ];

    const result = validateBookmarksDataset(bookmarks);
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain("minimum expected is 10");
  });

  test("should respect a valid MIN_BOOKMARKS_THRESHOLD in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.MIN_BOOKMARKS_THRESHOLD = "5";

    const bookmarks = [
      createBookmark("1", "https://example.com/1", "Bookmark 1"),
      createBookmark("2", "https://example.com/2", "Bookmark 2"),
      createBookmark("3", "https://example.com/3", "Bookmark 3"),
      createBookmark("4", "https://example.com/4", "Bookmark 4"),
    ];

    const result = validateBookmarksDataset(bookmarks);
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain("minimum expected is 5");
  });

  test("should invalidate a dataset with a single test bookmark", () => {
    const bookmarks: UnifiedBookmark[] = [
      {
        id: "1",
        url: "https://test.com",
        title: "Test Bookmark",
        description: "A test bookmark",
        slug: "test-bookmark",
        tags: [],
        dateBookmarked: "2023-01-01T00:00:00Z",
        sourceUpdatedAt: "2023-01-01T00:00:00Z",
        dateCreated: "2023-01-01T00:00:00Z",
        modifiedAt: "2023-01-01T00:00:00Z",
        archived: false,
        isFavorite: false,
        taggingStatus: "complete",
        content: {
          type: "link",
          url: "https://test.com",
          title: "Test Bookmark",
          description: "A test bookmark",
        },
        assets: [],
      },
    ];

    const result = validateBookmarksDataset(bookmarks);
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain("Single test bookmark detected");
  });

  test("should invalidate a dataset where all bookmarks are missing URLs", () => {
    const bookmarks: UnifiedBookmark[] = [
      {
        id: "1",
        url: "",
        title: "No URL Bookmark 1",
        description: "A bookmark without URL",
        slug: "no-url-bookmark-1",
        tags: [],
        dateBookmarked: "2023-01-01T00:00:00Z",
        sourceUpdatedAt: "2023-01-01T00:00:00Z",
        dateCreated: "2023-01-01T00:00:00Z",
        modifiedAt: "2023-01-01T00:00:00Z",
        archived: false,
        isFavorite: false,
        taggingStatus: "complete",
        content: {
          type: "link",
          url: "",
          title: "No URL Bookmark 1",
          description: "A bookmark without URL",
        },
        assets: [],
      },
      {
        id: "2",
        url: "",
        title: "No URL Bookmark 2",
        description: "Another bookmark without URL",
        slug: "no-url-bookmark-2",
        tags: [],
        dateBookmarked: "2023-01-02T00:00:00Z",
        sourceUpdatedAt: "2023-01-02T00:00:00Z",
        dateCreated: "2023-01-02T00:00:00Z",
        modifiedAt: "2023-01-02T00:00:00Z",
        archived: false,
        isFavorite: false,
        taggingStatus: "complete",
        content: {
          type: "link",
          url: "",
          title: "No URL Bookmark 2",
          description: "Another bookmark without URL",
        },
        assets: [],
      },
    ];

    const result = validateBookmarksDataset(bookmarks);
    expect(result.isValid).toBe(false);
    expect(result.reason).toBe("All bookmarks missing URLs");
  });

  test("should validate a dataset where some bookmarks have URLs", () => {
    const bookmarks: UnifiedBookmark[] = [
      {
        id: "1",
        url: "https://example.com",
        title: "Valid Bookmark",
        description: "A valid bookmark",
        slug: "valid-bookmark",
        tags: [],
        dateBookmarked: "2023-01-01T00:00:00Z",
        sourceUpdatedAt: "2023-01-01T00:00:00Z",
        dateCreated: "2023-01-01T00:00:00Z",
        modifiedAt: "2023-01-01T00:00:00Z",
        archived: false,
        isFavorite: false,
        taggingStatus: "complete",
        content: {
          type: "link",
          url: "https://example.com",
          title: "Valid Bookmark",
          description: "A valid bookmark",
        },
        assets: [],
      },
      {
        id: "2",
        url: "",
        title: "No URL Bookmark",
        description: "A bookmark without URL",
        slug: "no-url-bookmark",
        tags: [],
        dateBookmarked: "2023-01-02T00:00:00Z",
        sourceUpdatedAt: "2023-01-02T00:00:00Z",
        dateCreated: "2023-01-02T00:00:00Z",
        modifiedAt: "2023-01-02T00:00:00Z",
        archived: false,
        isFavorite: false,
        taggingStatus: "complete",
        content: {
          type: "link",
          url: "",
          title: "No URL Bookmark",
          description: "A bookmark without URL",
        },
        assets: [],
      },
    ];

    const result = validateBookmarksDataset(bookmarks);
    expect(result.isValid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  test("should accept null API enrichment statuses", () => {
    const result = bookmarksApiResponseSchema.safeParse({
      bookmarks: [
        {
          id: "bookmark-with-null-statuses",
          createdAt: "2026-04-23T06:25:16.000Z",
          modifiedAt: "2026-04-23T06:25:16.000Z",
          title: "Valid API Bookmark",
          archived: false,
          favourited: false,
          taggingStatus: null,
          summarizationStatus: null,
          note: null,
          summary: null,
          tags: [],
          content: {
            type: "link",
            url: "https://example.com",
            title: "Valid API Bookmark",
            description: "A bookmark from the API.",
          },
        },
      ],
      nextCursor: null,
    });

    expect(result.success).toBe(true);
  });
});
