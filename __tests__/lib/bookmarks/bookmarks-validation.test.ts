/**
 * @file Unit tests for bookmarks validation logic.
 * This file tests the validation functions in lib/validators/bookmarks.ts to ensure
 * they correctly identify invalid datasets such as single test bookmarks or bookmarks
 * missing URLs.
 * @module __tests__/lib/bookmarks-validation.test
 */

import { validateBookmarksDataset } from "../../../src/lib/validators/bookmarks";
import type { UnifiedBookmark } from "../../../src/types";

// Mock console.error to suppress error logs during tests
jest.spyOn(console, "error").mockImplementation(() => {});

describe("Bookmarks Validation", () => {
  beforeEach(() => {
    // Clear mock calls before each test
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  test("should validate a normal dataset with multiple bookmarks", () => {
    const bookmarks: UnifiedBookmark[] = [
      {
        id: "1",
        url: "https://example.com",
        title: "Example",
        description: "An example bookmark",
        tags: [],
        dateBookmarked: "2023-01-01T00:00:00Z",
        createdAt: "2023-01-01T00:00:00Z",
        modifiedAt: "2023-01-01T00:00:00Z",
        archived: false,
        favourited: false,
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
        tags: [],
        dateBookmarked: "2023-01-02T00:00:00Z",
        createdAt: "2023-01-02T00:00:00Z",
        modifiedAt: "2023-01-02T00:00:00Z",
        archived: false,
        favourited: false,
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

  test("should invalidate a dataset with a single test bookmark", () => {
    const bookmarks: UnifiedBookmark[] = [
      {
        id: "1",
        url: "https://test.com",
        title: "Test Bookmark",
        description: "A test bookmark",
        tags: [],
        dateBookmarked: "2023-01-01T00:00:00Z",
        createdAt: "2023-01-01T00:00:00Z",
        modifiedAt: "2023-01-01T00:00:00Z",
        archived: false,
        favourited: false,
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
        tags: [],
        dateBookmarked: "2023-01-01T00:00:00Z",
        createdAt: "2023-01-01T00:00:00Z",
        modifiedAt: "2023-01-01T00:00:00Z",
        archived: false,
        favourited: false,
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
        tags: [],
        dateBookmarked: "2023-01-02T00:00:00Z",
        createdAt: "2023-01-02T00:00:00Z",
        modifiedAt: "2023-01-02T00:00:00Z",
        archived: false,
        favourited: false,
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
        tags: [],
        dateBookmarked: "2023-01-01T00:00:00Z",
        createdAt: "2023-01-01T00:00:00Z",
        modifiedAt: "2023-01-01T00:00:00Z",
        archived: false,
        favourited: false,
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
        tags: [],
        dateBookmarked: "2023-01-02T00:00:00Z",
        createdAt: "2023-01-02T00:00:00Z",
        modifiedAt: "2023-01-02T00:00:00Z",
        archived: false,
        favourited: false,
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
});
