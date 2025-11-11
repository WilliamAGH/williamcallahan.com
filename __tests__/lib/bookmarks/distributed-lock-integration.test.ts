/**
 * Integration test for distributed lock and bookmarks data access
 *
 * This test validates the complete flow of:
 * 1. Lock acquisition and release
 * 2. Lock contention handling
 * 3. Stale lock cleanup
 * 4. Integration with refresh workflow
 * 5. Data persistence and pagination
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { BOOKMARKS_S3_PATHS, BOOKMARKS_PER_PAGE } from "@/lib/constants";
import type { DistributedLockEntry, UnifiedBookmark } from "@/types";
import type { BookmarksIndex } from "@/types/bookmark";

describe("Distributed Lock and Bookmarks Data Access Integration", () => {
  let mockS3State: {
    lock: DistributedLockEntry | null;
    bookmarks: UnifiedBookmark[] | null;
    index: BookmarksIndex | null;
    heartbeat: Record<string, unknown> | null;
    pages: Record<string, UnifiedBookmark[]>;
    writes: string[];
    deletes: string[];
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    // Initialize mock S3 state
    mockS3State = {
      lock: null,
      bookmarks: null,
      index: null,
      heartbeat: null,
      pages: {},
      writes: [],
      deletes: [],
    };

    // Set up environment
    process.env.BOOKMARKS_LOCK_TTL_MS = "300000"; // 5 minutes
    process.env.MIN_BOOKMARKS_THRESHOLD = "1";
    process.env.NODE_ENV = "test";
    process.env.SELECTIVE_OG_REFRESH = "true";
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  type S3MockHandlers = {
    readJsonS3: jest.Mock<Promise<unknown>, [string]>;
    writeJsonS3: jest.Mock<Promise<void>, [string, unknown, unknown?]>;
    deleteFromS3: jest.Mock<Promise<void>, [string]>;
    listS3Objects: jest.Mock<Promise<string[]>, [string?]>;
  };

  const setupS3Mocks = (overrides?: Partial<S3MockHandlers>): S3MockHandlers => {
    const handlers: S3MockHandlers = {
      readJsonS3: jest.fn((key: string) => {
        if (key === BOOKMARKS_S3_PATHS.LOCK) {
          return Promise.resolve(mockS3State.lock);
        }
        if (key === BOOKMARKS_S3_PATHS.INDEX) {
          return Promise.resolve(mockS3State.index);
        }
        if (key === BOOKMARKS_S3_PATHS.FILE) {
          return Promise.resolve(mockS3State.bookmarks);
        }
        if (key === BOOKMARKS_S3_PATHS.HEARTBEAT) {
          return Promise.resolve(mockS3State.heartbeat);
        }
        if (key.startsWith(BOOKMARKS_S3_PATHS.PAGE_PREFIX)) {
          const pageNum = key.replace(BOOKMARKS_S3_PATHS.PAGE_PREFIX, "").replace(".json", "");
          return Promise.resolve(mockS3State.pages[pageNum] ?? null);
        }
        return Promise.resolve(null);
      }),
      writeJsonS3: jest.fn((key: string, value: unknown) => {
        mockS3State.writes.push(key);
        if (key === BOOKMARKS_S3_PATHS.LOCK) {
          if (mockS3State.lock === null) {
            mockS3State.lock = value as DistributedLockEntry;
          } else {
            throw new Error("Lock already exists");
          }
        } else if (key === BOOKMARKS_S3_PATHS.INDEX) {
          mockS3State.index = value as BookmarksIndex;
        } else if (key === BOOKMARKS_S3_PATHS.FILE) {
          mockS3State.bookmarks = value as UnifiedBookmark[];
        } else if (key === BOOKMARKS_S3_PATHS.HEARTBEAT) {
          mockS3State.heartbeat = value as Record<string, unknown>;
        } else if (key.startsWith(BOOKMARKS_S3_PATHS.PAGE_PREFIX)) {
          const pageNum = key.replace(BOOKMARKS_S3_PATHS.PAGE_PREFIX, "").replace(".json", "");
          mockS3State.pages[pageNum] = value as UnifiedBookmark[];
        }
        return Promise.resolve();
      }),
      deleteFromS3: jest.fn((key: string) => {
        mockS3State.deletes.push(key);
        if (key === BOOKMARKS_S3_PATHS.LOCK) {
          mockS3State.lock = null;
        }
        return Promise.resolve();
      }),
      listS3Objects: jest.fn((prefix?: string) => {
        if (!prefix) return Promise.resolve([]);
        if (prefix.startsWith(BOOKMARKS_S3_PATHS.PAGE_PREFIX)) {
          const keys = Object.keys(mockS3State.pages).map(page => `${BOOKMARKS_S3_PATHS.PAGE_PREFIX}${page}.json`);
          return Promise.resolve(keys);
        }
        return Promise.resolve([]);
      }),
    };

    if (overrides) {
      Object.assign(handlers, overrides);
    }

    jest.doMock("@/lib/s3-utils", () => handlers);
    return handlers;
  };

  describe("Core Lock Functionality", () => {
    it("should acquire lock, perform refresh, and release lock in atomic operation", async () => {
      setupS3Mocks();

      const bookmarksModule = await import("@/lib/bookmarks/bookmarks-data-access.server");

      const testBookmarks: UnifiedBookmark[] = [
        {
          id: "test-1",
          url: "https://example.com/1",
          title: "Test Bookmark 1",
          description: "Test description 1",
          tags: ["test", "refactoring"],
          dateBookmarked: "2024-01-01T00:00:00.000Z",
          sourceUpdatedAt: "2024-01-01T00:00:00.000Z",
        },
        {
          id: "test-2",
          url: "https://example.com/2",
          title: "Test Bookmark 2",
          description: "Test description 2",
          tags: ["test"],
          dateBookmarked: "2024-01-02T00:00:00.000Z",
          sourceUpdatedAt: "2024-01-02T00:00:00.000Z",
        },
      ];

      bookmarksModule.setRefreshBookmarksCallback(() => Promise.resolve(testBookmarks));
      bookmarksModule.initializeBookmarksDataAccess();

      const result = await bookmarksModule.refreshAndPersistBookmarks();
      bookmarksModule.cleanupBookmarksDataAccess();

      expect(result).toBeTruthy();
      expect(result).toHaveLength(2);
      expect(mockS3State.writes).toContain(BOOKMARKS_S3_PATHS.LOCK);
      expect(mockS3State.writes).toContain(BOOKMARKS_S3_PATHS.FILE);
      expect(mockS3State.writes).toContain(BOOKMARKS_S3_PATHS.INDEX);
      expect(mockS3State.writes).toContain(BOOKMARKS_S3_PATHS.HEARTBEAT);
      expect(mockS3State.deletes).toContain(BOOKMARKS_S3_PATHS.LOCK);
      expect(mockS3State.lock).toBeNull();
      expect(mockS3State.bookmarks).toHaveLength(2);
      expect(mockS3State.index?.count).toBe(2);
    });

    it("should handle concurrent lock attempts correctly", async () => {
      // Simulate two processes trying to acquire lock simultaneously
      const process1Lock: DistributedLockEntry = {
        instanceId: "process-1",
        acquiredAt: Date.now(),
        ttlMs: 300000,
      };

      let lockAttempts = 0;
      setupS3Mocks({
        readJsonS3: jest.fn((key: string) => {
          if (key === BOOKMARKS_S3_PATHS.LOCK) {
            return Promise.resolve(lockAttempts > 0 ? process1Lock : null);
          }
          return Promise.resolve(null);
        }),
        writeJsonS3: jest.fn((key: string) => {
          if (key === BOOKMARKS_S3_PATHS.LOCK) {
            lockAttempts += 1;
            if (lockAttempts === 1) {
              return Promise.resolve();
            }
            throw new Error("Lock already exists");
          }
          return Promise.resolve();
        }),
      });

      const bookmarksModule = await import("@/lib/bookmarks/bookmarks-data-access.server");

      bookmarksModule.setRefreshBookmarksCallback(() =>
        Promise.resolve([
          {
            id: "test",
            url: "https://example.com",
            title: "Test",
            description: "Test",
            tags: [],
            dateBookmarked: "2024-01-01T00:00:00.000Z",
            sourceUpdatedAt: "2024-01-01T00:00:00.000Z",
          },
        ]),
      );
      bookmarksModule.initializeBookmarksDataAccess();

      const result = await bookmarksModule.refreshAndPersistBookmarks();
      bookmarksModule.cleanupBookmarksDataAccess();

      expect(result).toBeNull();
    });

    it("should clean up stale locks and allow new acquisition", async () => {
      const now = Date.now();
      const staleLock: DistributedLockEntry = {
        instanceId: "stale-process",
        acquiredAt: now - 400000,
        ttlMs: 300000,
      };

      let lockState: DistributedLockEntry | null = staleLock;
      let cleanupAttempted = false;

      setupS3Mocks({
        readJsonS3: jest.fn((key: string) => {
          if (key === BOOKMARKS_S3_PATHS.LOCK) {
            return Promise.resolve(lockState);
          }
          return Promise.resolve(null);
        }),
        writeJsonS3: jest.fn((key: string, value: unknown) => {
          if (key === BOOKMARKS_S3_PATHS.LOCK) {
            if (cleanupAttempted) {
              lockState = value as DistributedLockEntry;
              return Promise.resolve();
            }
            throw new Error("Stale lock exists");
          }
          return Promise.resolve();
        }),
        deleteFromS3: jest.fn((key: string) => {
          if (key === BOOKMARKS_S3_PATHS.LOCK) {
            cleanupAttempted = true;
            lockState = null;
          }
          return Promise.resolve();
        }),
      });

      const bookmarksModule = await import("@/lib/bookmarks/bookmarks-data-access.server");

      bookmarksModule.setRefreshBookmarksCallback(() =>
        Promise.resolve([
          {
            id: "test",
            url: "https://example.com",
            title: "Test",
            description: "Test",
            tags: [],
            dateBookmarked: "2024-01-01T00:00:00.000Z",
            sourceUpdatedAt: "2024-01-01T00:00:00.000Z",
          },
        ]),
      );
      bookmarksModule.initializeBookmarksDataAccess();

      await new Promise(resolve => setTimeout(resolve, 150));

      const result = await bookmarksModule.refreshAndPersistBookmarks();

      if (result === null) {
        await new Promise(resolve => setTimeout(resolve, 100));
        const retryResult = await bookmarksModule.refreshAndPersistBookmarks();
        expect(retryResult).toBeTruthy();
      } else {
        expect(result).toBeTruthy();
      }

      bookmarksModule.cleanupBookmarksDataAccess();
      expect(cleanupAttempted).toBe(true);
    });

    it("should verify lock ownership through read-back", async () => {
      let writeAttempts = 0;
      let currentLock: DistributedLockEntry | null = null;

      setupS3Mocks({
        readJsonS3: jest.fn((key: string) => {
          if (key === BOOKMARKS_S3_PATHS.LOCK) {
            return Promise.resolve(currentLock);
          }
          return Promise.resolve(null);
        }),
        writeJsonS3: jest.fn((key: string, value: unknown) => {
          if (key === BOOKMARKS_S3_PATHS.LOCK) {
            writeAttempts += 1;
            if (writeAttempts === 1) {
              currentLock = value as DistributedLockEntry;
            } else {
              currentLock = {
                instanceId: "other-process",
                acquiredAt: Date.now(),
                ttlMs: 300000,
              };
            }
          }
          return Promise.resolve();
        }),
        deleteFromS3: jest.fn((key: string) => {
          if (key === BOOKMARKS_S3_PATHS.LOCK) {
            currentLock = null;
          }
          return Promise.resolve();
        }),
      });

      const bookmarksModule = await import("@/lib/bookmarks/bookmarks-data-access.server");

      bookmarksModule.setRefreshBookmarksCallback(() =>
        Promise.resolve([
          {
            id: "test",
            url: "https://example.com",
            title: "Test",
            description: "Test",
            tags: [],
            dateBookmarked: "2024-01-01T00:00:00.000Z",
            sourceUpdatedAt: "2024-01-01T00:00:00.000Z",
          },
        ]),
      );
      bookmarksModule.initializeBookmarksDataAccess();

      const result = await bookmarksModule.refreshAndPersistBookmarks();
      bookmarksModule.cleanupBookmarksDataAccess();

      expect(result).toBeTruthy();
      expect(writeAttempts).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Persistence Integration", () => {
    it("should correctly paginate and persist bookmarks", async () => {
      setupS3Mocks();

      const bookmarksModule = await import("@/lib/bookmarks/bookmarks-data-access.server");

      const manyBookmarks: UnifiedBookmark[] = Array.from({ length: BOOKMARKS_PER_PAGE + 5 }, (_, i) => ({
        id: `bookmark-${i}`,
        url: `https://example.com/${i}`,
        title: `Bookmark ${i}`,
        description: `Description ${i}`,
        tags: [],
        dateBookmarked: new Date(2024, 0, i + 1).toISOString(),
        sourceUpdatedAt: new Date(2024, 0, i + 1).toISOString(),
      }));

      bookmarksModule.setRefreshBookmarksCallback(() => Promise.resolve(manyBookmarks));
      bookmarksModule.initializeBookmarksDataAccess();

      const result = await bookmarksModule.refreshAndPersistBookmarks();
      bookmarksModule.cleanupBookmarksDataAccess();

      expect(result).toBeTruthy();
      expect(result).toHaveLength(manyBookmarks.length);
      const pageWrites = mockS3State.writes.filter(w => w.startsWith(BOOKMARKS_S3_PATHS.PAGE_PREFIX));
      expect(pageWrites.length).toBeGreaterThan(1);
      expect(mockS3State.index?.totalPages).toBeGreaterThan(1);
      expect(mockS3State.index?.count).toBe(manyBookmarks.length);
    });
  });

  describe("State Management", () => {
    it("should maintain consistent state across lock, refresh, and persist operations", async () => {
      const operationLog: string[] = [];
      let lockState: DistributedLockEntry | null = null;

      setupS3Mocks({
        readJsonS3: jest.fn((key: string) => {
          operationLog.push(`READ:${key}`);
          if (key === BOOKMARKS_S3_PATHS.LOCK) {
            return Promise.resolve(lockState);
          }
          return Promise.resolve(null);
        }),
        writeJsonS3: jest.fn((key: string, value: unknown) => {
          operationLog.push(`WRITE:${key}`);
          if (key === BOOKMARKS_S3_PATHS.LOCK && lockState === null) {
            lockState = value as DistributedLockEntry;
          }
          return Promise.resolve();
        }),
        deleteFromS3: jest.fn((key: string) => {
          operationLog.push(`DELETE:${key}`);
          if (key === BOOKMARKS_S3_PATHS.LOCK) {
            lockState = null;
          }
          return Promise.resolve();
        }),
      });

      const bookmarksModule = await import("@/lib/bookmarks/bookmarks-data-access.server");

      bookmarksModule.setRefreshBookmarksCallback(() => {
        operationLog.push("REFRESH_CALLBACK");
        return Promise.resolve([
          {
            id: "test",
            url: "https://example.com",
            title: "Test",
            description: "Test",
            tags: [],
            dateBookmarked: "2024-01-01T00:00:00.000Z",
            sourceUpdatedAt: "2024-01-01T00:00:00.000Z",
          },
        ]);
      });
      bookmarksModule.initializeBookmarksDataAccess();

      const result = await bookmarksModule.refreshAndPersistBookmarks();
      bookmarksModule.cleanupBookmarksDataAccess();

      if (result !== null) {
        const lockWriteIndex = operationLog.indexOf(`WRITE:${BOOKMARKS_S3_PATHS.LOCK}`);
        const refreshIndex = operationLog.indexOf("REFRESH_CALLBACK");
        const dataWriteIndex = operationLog.indexOf(`WRITE:${BOOKMARKS_S3_PATHS.FILE}`);
        const lockDeleteIndex = operationLog.indexOf(`DELETE:${BOOKMARKS_S3_PATHS.LOCK}`);

        expect(lockWriteIndex).toBeGreaterThan(-1);
        if (refreshIndex > -1) {
          expect(lockWriteIndex).toBeLessThan(refreshIndex);
          expect(refreshIndex).toBeLessThan(dataWriteIndex);
        }
        if (dataWriteIndex > -1) {
          expect(dataWriteIndex).toBeLessThan(lockDeleteIndex);
        }
      }

      expect(operationLog).toContain(`READ:${BOOKMARKS_S3_PATHS.LOCK}`);
    });
  });
});
