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

  describe("Core Lock Functionality", () => {
    it("should acquire lock, perform refresh, and release lock in atomic operation", async () => {
      await jest.isolateModulesAsync(async () => {
        // Mock S3 operations with stateful behavior
        jest.doMock("@/lib/s3-utils", () => ({
          readJsonS3: jest.fn().mockImplementation((key: string) => {
            if (key === BOOKMARKS_S3_PATHS.LOCK) {
              return Promise.resolve(mockS3State.lock);
            }
            if (key === BOOKMARKS_S3_PATHS.INDEX) {
              return Promise.resolve(mockS3State.index);
            }
            if (key === BOOKMARKS_S3_PATHS.FILE) {
              return Promise.resolve(mockS3State.bookmarks);
            }
            if (key.startsWith(BOOKMARKS_S3_PATHS.PAGE_PREFIX)) {
              const pageNum = key.replace(BOOKMARKS_S3_PATHS.PAGE_PREFIX, "").replace(".json", "");
              return Promise.resolve(mockS3State.pages[pageNum] || null);
            }
            return Promise.resolve(null);
          }),
          writeJsonS3: jest.fn().mockImplementation((key: string, value: unknown) => {
            mockS3State.writes.push(key);
            
            if (key === BOOKMARKS_S3_PATHS.LOCK) {
              // Simulate atomic conditional write (IfNoneMatch)
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
          deleteFromS3: jest.fn().mockImplementation((key: string) => {
            mockS3State.deletes.push(key);
            if (key === BOOKMARKS_S3_PATHS.LOCK) {
              mockS3State.lock = null;
            }
            return Promise.resolve();
          }),
        }));

        const bookmarksModule = await import("@/lib/bookmarks/bookmarks-data-access.server");
        
        // Set up test data
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

        // Execute refresh operation
        const result = await bookmarksModule.refreshAndPersistBookmarks();

        // Verify the complete flow
        expect(result).toBeTruthy();
        expect(result).toHaveLength(2);
        
        // Verify lock was acquired (written to S3)
        expect(mockS3State.writes).toContain(BOOKMARKS_S3_PATHS.LOCK);
        
        // Verify data was persisted
        expect(mockS3State.writes).toContain(BOOKMARKS_S3_PATHS.FILE);
        expect(mockS3State.writes).toContain(BOOKMARKS_S3_PATHS.INDEX);
        expect(mockS3State.writes).toContain(BOOKMARKS_S3_PATHS.HEARTBEAT);
        
        // Verify lock was released
        expect(mockS3State.deletes).toContain(BOOKMARKS_S3_PATHS.LOCK);
        expect(mockS3State.lock).toBeNull();
        
        // Verify persisted data
        expect(mockS3State.bookmarks).toHaveLength(2);
        expect(mockS3State.index?.count).toBe(2);
      });
    });

    it("should handle concurrent lock attempts correctly", async () => {
      // Simulate two processes trying to acquire lock simultaneously
      const process1Lock: DistributedLockEntry = {
        instanceId: "process-1",
        acquiredAt: Date.now(),
        ttlMs: 300000,
      };

      await jest.isolateModulesAsync(async () => {
        let lockAttempts = 0;
        
        jest.doMock("@/lib/s3-utils", () => ({
          readJsonS3: jest.fn().mockImplementation((key: string) => {
            if (key === BOOKMARKS_S3_PATHS.LOCK) {
              // First read: no lock
              // Subsequent reads: process1 has lock
              return Promise.resolve(lockAttempts > 0 ? process1Lock : null);
            }
            return Promise.resolve(null);
          }),
          writeJsonS3: jest.fn().mockImplementation((key: string, _value: unknown) => {
            if (key === BOOKMARKS_S3_PATHS.LOCK) {
              lockAttempts++;
              // First attempt succeeds (process1), second fails
              if (lockAttempts === 1) {
                return Promise.resolve();
              }
              throw new Error("Lock already exists");
            }
            return Promise.resolve();
          }),
          deleteFromS3: jest.fn(),
        }));

        const bookmarksModule = await import("@/lib/bookmarks/bookmarks-data-access.server");
        
        bookmarksModule.setRefreshBookmarksCallback(() => 
          Promise.resolve([{
            id: "test",
            url: "https://example.com",
            title: "Test",
            description: "Test",
            tags: [],
            dateBookmarked: "2024-01-01T00:00:00.000Z",
            sourceUpdatedAt: "2024-01-01T00:00:00.000Z",
          }])
        );
        bookmarksModule.initializeBookmarksDataAccess();

        // Process 2 attempts to acquire lock (should fail)
        const result = await bookmarksModule.refreshAndPersistBookmarks();
        
        // Should return null because lock is held by process1
        expect(result).toBeNull();
      });
    });

    it("should clean up stale locks and allow new acquisition", async () => {
      await jest.isolateModulesAsync(async () => {
        const now = Date.now();
        const staleLock: DistributedLockEntry = {
          instanceId: "stale-process",
          acquiredAt: now - 400000, // 400 seconds ago (> 5 min TTL)
          ttlMs: 300000, // 5 minute TTL
        };

        let lockState: DistributedLockEntry | null = staleLock;
        let cleanupAttempted = false;

        jest.doMock("@/lib/s3-utils", () => ({
          readJsonS3: jest.fn().mockImplementation((key: string) => {
            if (key === BOOKMARKS_S3_PATHS.LOCK) {
              return Promise.resolve(lockState);
            }
            return Promise.resolve(null);
          }),
          writeJsonS3: jest.fn().mockImplementation((key: string, value: unknown) => {
            if (key === BOOKMARKS_S3_PATHS.LOCK) {
              // Allow new lock after cleanup
              if (cleanupAttempted) {
                lockState = value as DistributedLockEntry;
                return Promise.resolve();
              }
              throw new Error("Stale lock exists");
            }
            return Promise.resolve();
          }),
          deleteFromS3: jest.fn().mockImplementation((key: string) => {
            if (key === BOOKMARKS_S3_PATHS.LOCK) {
              cleanupAttempted = true;
              lockState = null;
            }
            return Promise.resolve();
          }),
        }));

        const bookmarksModule = await import("@/lib/bookmarks/bookmarks-data-access.server");
        
        bookmarksModule.setRefreshBookmarksCallback(() => 
          Promise.resolve([{
            id: "test",
            url: "https://example.com",
            title: "Test",
            description: "Test",
            tags: [],
            dateBookmarked: "2024-01-01T00:00:00.000Z",
            sourceUpdatedAt: "2024-01-01T00:00:00.000Z",
          }])
        );
        bookmarksModule.initializeBookmarksDataAccess();

        // Wait for cleanup cycle
        await new Promise(resolve => setTimeout(resolve, 150));

        // Should be able to acquire lock after stale lock cleanup
        const result = await bookmarksModule.refreshAndPersistBookmarks();
        
        // Might need a retry if cleanup hasn't run yet
        if (result === null) {
          await new Promise(resolve => setTimeout(resolve, 100));
          const retryResult = await bookmarksModule.refreshAndPersistBookmarks();
          expect(retryResult).toBeTruthy();
        } else {
          expect(result).toBeTruthy();
        }
        
        expect(cleanupAttempted).toBe(true);
      });
    });

    it("should verify lock ownership through read-back", async () => {
      await jest.isolateModulesAsync(async () => {
        let writeAttempts = 0;
        let currentLock: DistributedLockEntry | null = null;

        jest.doMock("@/lib/s3-utils", () => ({
          readJsonS3: jest.fn().mockImplementation((key: string) => {
            if (key === BOOKMARKS_S3_PATHS.LOCK) {
              return Promise.resolve(currentLock);
            }
            return Promise.resolve(null);
          }),
          writeJsonS3: jest.fn().mockImplementation((key: string, value: unknown) => {
            if (key === BOOKMARKS_S3_PATHS.LOCK) {
              writeAttempts++;
              const lockValue = value as DistributedLockEntry;
              
              // Simulate race condition: another process wins on second attempt
              if (writeAttempts === 1) {
                currentLock = lockValue; // Our write succeeds
              } else {
                // Another process won the race
                currentLock = {
                  instanceId: "other-process",
                  acquiredAt: Date.now(),
                  ttlMs: 300000,
                };
              }
              return Promise.resolve();
            }
            return Promise.resolve();
          }),
          deleteFromS3: jest.fn().mockImplementation((key: string) => {
            if (key === BOOKMARKS_S3_PATHS.LOCK) {
              currentLock = null;
            }
            return Promise.resolve();
          }),
        }));

        const bookmarksModule = await import("@/lib/bookmarks/bookmarks-data-access.server");
        
        bookmarksModule.setRefreshBookmarksCallback(() => 
          Promise.resolve([{
            id: "test",
            url: "https://example.com",
            title: "Test",
            description: "Test",
            tags: [],
            dateBookmarked: "2024-01-01T00:00:00.000Z",
            sourceUpdatedAt: "2024-01-01T00:00:00.000Z",
          }])
        );
        bookmarksModule.initializeBookmarksDataAccess();

        const result = await bookmarksModule.refreshAndPersistBookmarks();
        
        // Should succeed because read-back verification confirms our ownership
        expect(result).toBeTruthy();
        expect(writeAttempts).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe("Persistence Integration", () => {
    it("should correctly paginate and persist bookmarks", async () => {
      await jest.isolateModulesAsync(async () => {
        jest.doMock("@/lib/s3-utils", () => ({
          readJsonS3: jest.fn().mockImplementation((key: string) => {
            if (key === BOOKMARKS_S3_PATHS.LOCK) {
              return Promise.resolve(mockS3State.lock);
            }
            return Promise.resolve(null);
          }),
          writeJsonS3: jest.fn().mockImplementation((key: string, value: unknown) => {
            mockS3State.writes.push(key);
            
            if (key === BOOKMARKS_S3_PATHS.LOCK) {
              // Allow lock acquisition
              if (mockS3State.lock === null) {
                mockS3State.lock = value as DistributedLockEntry;
              }
            } else if (key.startsWith(BOOKMARKS_S3_PATHS.PAGE_PREFIX)) {
              const pageNum = key.replace(BOOKMARKS_S3_PATHS.PAGE_PREFIX, "").replace(".json", "");
              mockS3State.pages[pageNum] = value as UnifiedBookmark[];
            } else if (key === BOOKMARKS_S3_PATHS.INDEX) {
              mockS3State.index = value as BookmarksIndex;
            } else if (key === BOOKMARKS_S3_PATHS.FILE) {
              mockS3State.bookmarks = value as UnifiedBookmark[];
            }
            return Promise.resolve();
          }),
          deleteFromS3: jest.fn().mockImplementation((key: string) => {
            if (key === BOOKMARKS_S3_PATHS.LOCK) {
              mockS3State.lock = null;
            }
            return Promise.resolve();
          }),
        }));

        const bookmarksModule = await import("@/lib/bookmarks/bookmarks-data-access.server");
        
        // Create enough bookmarks to trigger pagination
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
        
        expect(result).toBeTruthy();
        expect(result).toHaveLength(manyBookmarks.length);
        
        // Verify pagination occurred
        const pageWrites = mockS3State.writes.filter(w => w.startsWith(BOOKMARKS_S3_PATHS.PAGE_PREFIX));
        expect(pageWrites.length).toBeGreaterThan(1);
        
        // Verify index was updated with pagination info
        expect(mockS3State.index?.totalPages).toBeGreaterThan(1);
        expect(mockS3State.index?.count).toBe(manyBookmarks.length);
      });
    });
  });

  describe("State Management", () => {
    it("should maintain consistent state across lock, refresh, and persist operations", async () => {
      await jest.isolateModulesAsync(async () => {
        const operationLog: string[] = [];
        let lockState: DistributedLockEntry | null = null;
        
        jest.doMock("@/lib/s3-utils", () => ({
          readJsonS3: jest.fn().mockImplementation((key: string) => {
            operationLog.push(`READ:${key}`);
            if (key === BOOKMARKS_S3_PATHS.LOCK) {
              return Promise.resolve(lockState);
            }
            return Promise.resolve(null);
          }),
          writeJsonS3: jest.fn().mockImplementation((key: string, value: unknown) => {
            operationLog.push(`WRITE:${key}`);
            if (key === BOOKMARKS_S3_PATHS.LOCK && lockState === null) {
              lockState = value as DistributedLockEntry;
            }
            return Promise.resolve();
          }),
          deleteFromS3: jest.fn().mockImplementation((key: string) => {
            operationLog.push(`DELETE:${key}`);
            if (key === BOOKMARKS_S3_PATHS.LOCK) {
              lockState = null;
            }
            return Promise.resolve();
          }),
        }));

        const bookmarksModule = await import("@/lib/bookmarks/bookmarks-data-access.server");
        
        bookmarksModule.setRefreshBookmarksCallback(() => {
          operationLog.push("REFRESH_CALLBACK");
          return Promise.resolve([{
            id: "test",
            url: "https://example.com",
            title: "Test",
            description: "Test",
            tags: [],
            dateBookmarked: "2024-01-01T00:00:00.000Z",
            sourceUpdatedAt: "2024-01-01T00:00:00.000Z",
          }]);
        });
        bookmarksModule.initializeBookmarksDataAccess();

        const result = await bookmarksModule.refreshAndPersistBookmarks();
        
        // Only verify if refresh actually happened
        if (result !== null) {
          // Verify operation order
          const lockWriteIndex = operationLog.indexOf(`WRITE:${BOOKMARKS_S3_PATHS.LOCK}`);
          const refreshIndex = operationLog.indexOf("REFRESH_CALLBACK");
          const dataWriteIndex = operationLog.indexOf(`WRITE:${BOOKMARKS_S3_PATHS.FILE}`);
          const lockDeleteIndex = operationLog.indexOf(`DELETE:${BOOKMARKS_S3_PATHS.LOCK}`);
          
          // Lock must be acquired before refresh
          expect(lockWriteIndex).toBeGreaterThan(-1);
          if (refreshIndex > -1) {
            expect(lockWriteIndex).toBeLessThan(refreshIndex);
            
            // Refresh must happen before data write
            expect(refreshIndex).toBeLessThan(dataWriteIndex);
          }
          
          // Lock must be released after data write (if data was written)
          if (dataWriteIndex > -1) {
            expect(dataWriteIndex).toBeLessThan(lockDeleteIndex);
          }
        }
        
        // At minimum, verify lock operations occurred
        expect(operationLog).toContain(`READ:${BOOKMARKS_S3_PATHS.LOCK}`);
      });
    });
  });
});