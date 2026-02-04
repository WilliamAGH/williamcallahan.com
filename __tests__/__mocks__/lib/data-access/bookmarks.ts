/**
 * Mock for @/lib/bookmarks/bookmarks-data-access.server
 *
 * This mock is used via Vitest alias in vitest.config.ts.
 * All exports from the real module must be present here.
 */
import { vi } from "vitest";

// Mock bookmarks data
const mockBookmarks = [
  {
    id: "test-bookmark-1",
    title: "Test Bookmark 1",
    url: "https://example.com/1",
    description: "Test description 1",
    tags: ["test", "mock"],
    createdAt: "2023-01-01T00:00:00Z",
    updatedAt: "2023-01-01T00:00:00Z",
    dateBookmarked: "2023-01-01T00:00:00Z",
    sourceUpdatedAt: "2023-01-01T00:00:00Z",
  },
  {
    id: "test-bookmark-2",
    title: "Test Bookmark 2",
    url: "https://example.com/2",
    description: "Test description 2",
    tags: ["test", "vitest"],
    createdAt: "2023-01-02T00:00:00Z",
    updatedAt: "2023-01-02T00:00:00Z",
    dateBookmarked: "2023-01-02T00:00:00Z",
    sourceUpdatedAt: "2023-01-02T00:00:00Z",
  },
];

// Mock index data
const mockIndex = {
  count: mockBookmarks.length,
  totalPages: 1,
  pageSize: 24,
  lastModified: new Date().toISOString(),
  lastFetchedAt: Date.now(),
  lastAttemptedAt: Date.now(),
  checksum: "mock-checksum",
};

// Core data access functions
export const getBookmarks = vi.fn(() => Promise.resolve(mockBookmarks));
export const getBookmarkById = vi.fn((id: string) =>
  Promise.resolve(mockBookmarks.find((b) => b.id === id) ?? null),
);
export const getBookmarksPage = vi.fn(() => Promise.resolve(mockBookmarks));
export const getBookmarksIndex = vi.fn(() => Promise.resolve(mockIndex));

// Tag-related functions
export const getBookmarksByTag = vi.fn(() =>
  Promise.resolve({
    bookmarks: mockBookmarks,
    totalCount: mockBookmarks.length,
    totalPages: 1,
    fromCache: false,
  }),
);
export const getTagBookmarksPage = vi.fn(() => Promise.resolve(mockBookmarks));
export const getTagBookmarksIndex = vi.fn(() => Promise.resolve(mockIndex));
export const listTagSlugs = vi.fn(() => Promise.resolve(["test", "mock", "vitest"]));

// Cache invalidation functions
export const invalidateBookmarksCache = vi.fn();
export const invalidateBookmarksPageCache = vi.fn();
export const invalidateBookmarksTagCache = vi.fn();
export const invalidateTagCache = vi.fn();
export const invalidateBookmarkCache = vi.fn();

// Legacy/refresh functions
export const setRefreshBookmarksCallback = vi.fn();
export const refreshBookmarks = vi.fn(() => Promise.resolve(mockBookmarks));
export const validateBookmarksDataset = vi.fn(() => ({ isValid: true, errors: [] }));
