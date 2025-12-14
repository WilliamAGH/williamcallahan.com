import { describe, it, expect, jest, beforeEach } from "@jest/globals";

import { BOOKMARKS_S3_PATHS, BOOKMARKS_PER_PAGE } from "@/lib/constants";
import type { UnifiedBookmark } from "@/types";

describe("Bookmarks lock + freshness behavior (unit)", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.BOOKMARKS_LOCK_TTL_MS = "300000"; // 5 minutes
    process.env.MIN_BOOKMARKS_THRESHOLD = "1"; // Allow single bookmark for testing
    process.env.NODE_ENV = "test"; // Ensure we're in test mode
    process.env.SELECTIVE_OG_REFRESH = "true"; // Force selective path with guaranteed heartbeat
  });

  it("acquires lock when none exists, writes heartbeat, updates index on unchanged, and releases lock", async () => {
    let lockState: unknown = null;
    const writes: string[] = [];
    const deletes: string[] = [];

    jest.doMock("@/lib/s3-utils", () => ({
      readJsonS3: jest.fn((key: string) => {
        if (key === BOOKMARKS_S3_PATHS.LOCK) {
          return Promise.resolve(lockState);
        }
        if (key === BOOKMARKS_S3_PATHS.INDEX) {
          return Promise.resolve({
            count: 1,
            totalPages: 1,
            pageSize: BOOKMARKS_PER_PAGE,
            lastModified: new Date().toISOString(),
            lastFetchedAt: Date.now() - 3600_000,
            lastAttemptedAt: Date.now() - 3600_000,
            checksum: "a:2024-01-01T00:00:00.000Z",
            changeDetected: false,
          });
        }
        return Promise.resolve(null);
      }),
      writeJsonS3: jest.fn((key: string, value: unknown) => {
        writes.push(key);
        if (key === BOOKMARKS_S3_PATHS.LOCK) {
          lockState = value;
        }
        return Promise.resolve();
      }),
      deleteFromS3: jest.fn((key: string) => {
        deletes.push(key);
        if (key === BOOKMARKS_S3_PATHS.LOCK) {
          lockState = null;
        }
        return Promise.resolve();
      }),
      listS3Objects: jest.fn(() => Promise.resolve([])),
    }));

    const {
      setRefreshBookmarksCallback,
      refreshAndPersistBookmarks,
      initializeBookmarksDataAccess,
      cleanupBookmarksDataAccess,
    } = await import("../../../src/lib/bookmarks/bookmarks-data-access.server");

    initializeBookmarksDataAccess();

    const testDate = "2024-01-01T00:00:00.000Z";
    const dataset: UnifiedBookmark[] = [
      {
        id: "a",
        url: "https://example.com",
        title: "Example Bookmark",
        description: "A valid bookmark for testing",
        tags: [],
        dateBookmarked: testDate,
        sourceUpdatedAt: testDate,
      } as UnifiedBookmark,
    ];

    setRefreshBookmarksCallback(() => dataset);

    const result = await refreshAndPersistBookmarks(false);
    cleanupBookmarksDataAccess();

    expect(result).not.toBeNull();
    expect(writes).toContain(BOOKMARKS_S3_PATHS.LOCK);
    expect(writes).toContain(BOOKMARKS_S3_PATHS.HEARTBEAT);
    expect(writes).toContain(BOOKMARKS_S3_PATHS.INDEX);
    expect(deletes).toContain(BOOKMARKS_S3_PATHS.LOCK);
  });
});
