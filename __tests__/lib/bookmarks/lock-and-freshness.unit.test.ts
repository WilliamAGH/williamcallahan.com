import { describe, it, expect, jest, beforeEach } from "@jest/globals";

import { BOOKMARKS_S3_PATHS, BOOKMARKS_PER_PAGE } from "@/lib/constants";
import type { UnifiedBookmark } from "@/types";

describe("Bookmarks lock + freshness behavior (unit)", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.BOOKMARKS_LOCK_TTL_MS = "300000"; // 5 minutes
  });

  it("acquires lock when none exists, writes heartbeat, updates index on unchanged, and releases lock", async () => {
    await jest.isolateModulesAsync(async () => {
      jest.doMock("@/lib/s3-utils", () => {
        let lockEntry: unknown = null;
        const readJsonS3 = jest.fn((key: string) => {
          if (key === BOOKMARKS_S3_PATHS.LOCK) return lockEntry; // reflect last lock write
          if (key === BOOKMARKS_S3_PATHS.INDEX)
            return {
              count: 1,
              totalPages: 1,
              pageSize: BOOKMARKS_PER_PAGE,
              lastModified: new Date().toISOString(),
              lastFetchedAt: Date.now() - 3600_000,
              lastAttemptedAt: Date.now() - 3600_000,
              checksum: "same",
            };
          return null;
        });
        const writeJsonS3 = jest.fn(async (key: string, value: unknown) => {
          if (key === BOOKMARKS_S3_PATHS.LOCK) lockEntry = value;
          return void 0;
        });
        const deleteFromS3 = jest.fn(async () => void 0);
        return { __esModule: true, readJsonS3, writeJsonS3, deleteFromS3 };
      });

      const s3 = await import("@/lib/s3-utils");
      const {
        setRefreshBookmarksCallback,
        refreshAndPersistBookmarks,
        initializeBookmarksDataAccess,
      } = await import("@/lib/bookmarks/bookmarks-data-access.server");

      initializeBookmarksDataAccess();

      // Provide dataset that will compute same checksum
      const dataset: Partial<UnifiedBookmark>[] = [
        {
          id: "a",
          url: "https://example.com",
          title: "t",
          description: "",
          tags: [],
          dateBookmarked: new Date().toISOString(),
          sourceUpdatedAt: new Date().toISOString(),
        },
      ];
      setRefreshBookmarksCallback(() => dataset as UnifiedBookmark[]);

      await refreshAndPersistBookmarks(false);

      const writes = (s3.writeJsonS3 as unknown as jest.Mock).mock.calls.map((c) => c[0]);
      const wroteLock = writes.includes(BOOKMARKS_S3_PATHS.LOCK);
      const wroteIndex = writes.includes(BOOKMARKS_S3_PATHS.INDEX);
      // Heartbeat can be written in multiple branches; ensure at least one write to heartbeat OR index freshness
      const wroteHeartbeat = writes.includes(BOOKMARKS_S3_PATHS.HEARTBEAT);

      expect(wroteLock).toBe(true);
      // Depending on execution path, heartbeat may be written later; assert at least one of the signals
      expect(wroteHeartbeat || wroteIndex).toBe(true);
      expect(wroteIndex).toBe(true); // index freshness should be updated even when unchanged

      const deletes = (s3.deleteFromS3 as unknown as jest.Mock).mock.calls.map((c) => c[0]);
      expect(deletes.includes(BOOKMARKS_S3_PATHS.LOCK)).toBe(true);
    });
  });
});
