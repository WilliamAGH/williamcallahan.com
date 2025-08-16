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
    await jest.isolateModulesAsync(async () => {
      // Global accumulators so we observe writes even if module instances differ
      (globalThis as any).__S3_WRITES__ = [] as string[];
      (globalThis as any).__S3_DELETES__ = [] as string[];
      (globalThis as any).__S3_LOCK__ = null as unknown;

      jest.doMock("@/lib/s3-utils", () => {
        const readJsonS3 = jest.fn().mockImplementation((key: string) => {
          const g: any = globalThis as any;
          console.log(`readJsonS3 called with key: ${key}`);
          if (key === BOOKMARKS_S3_PATHS.LOCK) {
            console.log(`Returning lock value:`, g.__S3_LOCK__);
            return Promise.resolve(g.__S3_LOCK__);
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
        });
        const writeJsonS3 = jest.fn().mockImplementation((key: string, value: unknown) => {
          const g: any = globalThis as any;
          console.log(`writeJsonS3 called with key: ${key}, value:`, value);
          g.__S3_WRITES__.push(key);
          if (key === BOOKMARKS_S3_PATHS.LOCK) {
            g.__S3_LOCK__ = value;
            console.log(`Lock saved:`, value);
          }
          return Promise.resolve(void 0);
        });
        const deleteFromS3 = jest.fn().mockImplementation((key: string) => {
          const g: any = globalThis as any;
          g.__S3_DELETES__.push(key);
          if (key === BOOKMARKS_S3_PATHS.LOCK) g.__S3_LOCK__ = null;
          return Promise.resolve(void 0);
        });
        return { __esModule: true, readJsonS3, writeJsonS3, deleteFromS3 };
      });

      const s3 = await import("@/lib/s3-utils");
      const { setRefreshBookmarksCallback, refreshAndPersistBookmarks, initializeBookmarksDataAccess } = await import(
        "../../../lib/bookmarks/bookmarks-data-access.server"
      );

      initializeBookmarksDataAccess();

      // Provide dataset that will compute checksum "a:2024-01-01T00:00:00.000Z"
      const testDate = "2024-01-01T00:00:00.000Z";
      const dataset: Partial<UnifiedBookmark>[] = [
        {
          id: "a",
          url: "https://example.com",
          title: "Example Bookmark",
          description: "A valid bookmark for testing",
          tags: [],
          dateBookmarked: testDate,
          sourceUpdatedAt: testDate,
        },
      ];
      setRefreshBookmarksCallback(() => {
        console.log("Refresh callback called, returning dataset");
        return dataset as UnifiedBookmark[];
      });

      console.log("Calling refreshAndPersistBookmarks...");
      const result = await refreshAndPersistBookmarks(false);
      console.log("refreshAndPersistBookmarks result:", result);

      const writes = ((globalThis as any).__S3_WRITES__ as string[]) || [];
      const wroteLock = writes.includes(BOOKMARKS_S3_PATHS.LOCK);
      const wroteHeartbeat = writes.includes(BOOKMARKS_S3_PATHS.HEARTBEAT);
      const wroteIndex = writes.includes(BOOKMARKS_S3_PATHS.INDEX);

      expect(wroteLock).toBe(true);
      // Heartbeat must be written; selective path should also update index freshness when unchanged
      expect(wroteHeartbeat).toBe(true);
      expect(wroteIndex).toBe(true);

      const deletes = ((globalThis as any).__S3_DELETES__ as string[]) || [];
      console.log("S3 deletes:", deletes);
      expect(deletes.includes(BOOKMARKS_S3_PATHS.LOCK)).toBe(true);
    });
  });
});
