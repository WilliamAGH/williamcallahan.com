/**
 * Mock for @/lib/bookmarks/bookmarks-data-access.server
 */

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
  },
  {
    id: "test-bookmark-2",
    title: "Test Bookmark 2",
    url: "https://example.com/2",
    description: "Test description 2",
    tags: ["test", "jest"],
    createdAt: "2023-01-02T00:00:00Z",
    updatedAt: "2023-01-02T00:00:00Z",
  },
];

// Mock the getBookmarks function
export const getBookmarks = jest.fn(() => Promise.resolve(mockBookmarks));

// Mock other exports that might be used
export const setRefreshBookmarksCallback = jest.fn();
export const refreshBookmarks = jest.fn(() => Promise.resolve(mockBookmarks));
export const validateBookmarksDataset = jest.fn(() => ({ isValid: true, errors: [] }));
