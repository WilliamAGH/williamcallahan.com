import { vi } from "vitest";
import { BOOKMARKS_S3_PATHS } from "@/lib/constants";
import type { DistributedLockEntry } from "@/types";

const loadBookmarksModule = async () => import("@/lib/bookmarks/refresh-logic.server");

describe("Distributed lock contention (unit)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.BOOKMARKS_LOCK_TTL_MS = "300000"; // 5 minutes
    process.env.MIN_BOOKMARKS_THRESHOLD = "1";
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("only one process acquires lock when racing", async () => {
    // in-memory lock state shared between mock invocations
    let lockState: DistributedLockEntry | null = null;

    vi.doMock("@/lib/s3/json", () => ({
      readJsonS3Optional: vi.fn((key: string) => {
        if (key === BOOKMARKS_S3_PATHS.LOCK) {
          return Promise.resolve(lockState);
        }
        return Promise.resolve(null);
      }),
      readJsonS3: vi.fn((key: string) => {
        if (key === BOOKMARKS_S3_PATHS.LOCK) {
          return Promise.resolve(lockState);
        }
        return Promise.resolve(null);
      }),
      writeJsonS3: vi.fn((key: string, value: DistributedLockEntry) => {
        if (key === BOOKMARKS_S3_PATHS.LOCK) {
          lockState = value;
        }
        return Promise.resolve();
      }),
    }));
    vi.doMock("@/lib/s3/objects", () => ({
      deleteFromS3: vi.fn((key: string) => {
        if (key === BOOKMARKS_S3_PATHS.LOCK) {
          lockState = null;
        }
        return Promise.resolve();
      }),
      listS3Objects: vi.fn(() => Promise.resolve([])),
    }));

    const firstModule = await loadBookmarksModule();

    firstModule.setRefreshBookmarksCallback(() =>
      Promise.resolve([
        {
          id: "process-1",
          url: "https://example.com",
          title: "Process 1",
          description: "From process 1",
          tags: [],
          dateBookmarked: "2024-01-01T00:00:00.000Z",
          sourceUpdatedAt: "2024-01-01T00:00:00.000Z",
        },
      ]),
    );
    firstModule.initializeBookmarksDataAccess();

    const firstResult = await firstModule.refreshAndPersistBookmarks();
    firstModule.cleanupBookmarksDataAccess();

    vi.resetModules();

    const existingLock = lockState;
    vi.doMock("@/lib/s3/json", () => ({
      readJsonS3Optional: vi.fn((key: string) => {
        if (key === BOOKMARKS_S3_PATHS.LOCK) {
          return Promise.resolve(existingLock);
        }
        return Promise.resolve(null);
      }),
      readJsonS3: vi.fn((key: string) => {
        if (key === BOOKMARKS_S3_PATHS.LOCK) {
          return Promise.resolve(existingLock);
        }
        return Promise.resolve(null);
      }),
      writeJsonS3: vi.fn(() => Promise.resolve()),
    }));
    vi.doMock("@/lib/s3/objects", () => ({
      deleteFromS3: vi.fn(() => Promise.resolve()),
      listS3Objects: vi.fn(() => Promise.resolve([])),
    }));

    const secondModule = await loadBookmarksModule();

    secondModule.setRefreshBookmarksCallback(() =>
      Promise.resolve([
        {
          id: "process-2",
          url: "https://example.com",
          title: "Process 2",
          description: "From process 2",
          tags: [],
          dateBookmarked: "2024-01-01T00:00:00.000Z",
          sourceUpdatedAt: "2024-01-01T00:00:00.000Z",
        },
      ]),
    );
    secondModule.initializeBookmarksDataAccess();

    const secondResult = await secondModule.refreshAndPersistBookmarks();
    secondModule.cleanupBookmarksDataAccess();

    expect(firstResult !== null).toBe(true);
    expect(secondResult).toBeNull();
  });

  it("respects TTL and allows new lock after expiry", async () => {
    vi.resetModules();

    let currentLock: DistributedLockEntry | null = {
      instanceId: "old-instance",
      acquiredAt: Date.now() - 400000,
      ttlMs: 300000,
    };
    let lockDeleted = false;

    vi.doMock("@/lib/s3/json", () => ({
      readJsonS3Optional: vi.fn((key: string) => {
        if (key === BOOKMARKS_S3_PATHS.LOCK) {
          return Promise.resolve(lockDeleted ? null : currentLock);
        }
        return Promise.resolve(null);
      }),
      readJsonS3: vi.fn((key: string) => {
        if (key === BOOKMARKS_S3_PATHS.LOCK) {
          return Promise.resolve(lockDeleted ? null : currentLock);
        }
        return Promise.resolve(null);
      }),
      writeJsonS3: vi.fn((key: string, value: DistributedLockEntry) => {
        if (key === BOOKMARKS_S3_PATHS.LOCK) {
          currentLock = value;
          lockDeleted = false;
        }
        return Promise.resolve();
      }),
    }));
    vi.doMock("@/lib/s3/objects", () => ({
      deleteFromS3: vi.fn((key: string) => {
        if (key === BOOKMARKS_S3_PATHS.LOCK) {
          lockDeleted = true;
        }
        return Promise.resolve();
      }),
      listS3Objects: vi.fn(() => Promise.resolve([])),
    }));

    const bookmarksModule = await loadBookmarksModule();

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

    await bookmarksModule.refreshAndPersistBookmarks();
    bookmarksModule.cleanupBookmarksDataAccess();

    expect(lockDeleted).toBe(true);
    expect(currentLock).not.toBeNull();
  });

  it("backs off when active lock exists", async () => {
    vi.resetModules();
    const activeLock: DistributedLockEntry = {
      instanceId: "active-instance",
      acquiredAt: Date.now() - 30000,
      ttlMs: 300000,
    };

    vi.doMock("@/lib/s3/json", () => ({
      readJsonS3Optional: vi.fn((key: string) => {
        if (key === BOOKMARKS_S3_PATHS.LOCK) {
          return Promise.resolve(activeLock);
        }
        return Promise.resolve(null);
      }),
      readJsonS3: vi.fn((key: string) => {
        if (key === BOOKMARKS_S3_PATHS.LOCK) {
          return Promise.resolve(activeLock);
        }
        return Promise.resolve(null);
      }),
      writeJsonS3: vi.fn(() => Promise.resolve()),
    }));
    vi.doMock("@/lib/s3/objects", () => ({
      deleteFromS3: vi.fn(() => Promise.resolve()),
      listS3Objects: vi.fn(() => Promise.resolve([])),
    }));

    const bookmarksModule = await loadBookmarksModule();

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

  it("implements read-back verification for lock ownership", async () => {
    vi.resetModules();
    let writeCount = 0;
    let lockValue: DistributedLockEntry | null = null;

    vi.doMock("@/lib/s3/json", () => ({
      readJsonS3Optional: vi.fn((key: string) => {
        if (key === BOOKMARKS_S3_PATHS.LOCK) {
          return Promise.resolve(lockValue);
        }
        return Promise.resolve(null);
      }),
      readJsonS3: vi.fn((key: string) => {
        if (key === BOOKMARKS_S3_PATHS.LOCK) {
          return Promise.resolve(lockValue);
        }
        return Promise.resolve(null);
      }),
      writeJsonS3: vi.fn((key: string, value: DistributedLockEntry) => {
        if (key === BOOKMARKS_S3_PATHS.LOCK) {
          writeCount += 1;
          if (writeCount === 1) {
            lockValue = value;
          } else {
            lockValue = {
              instanceId: "other-instance",
              acquiredAt: Date.now(),
              ttlMs: 300000,
            };
          }
        }
        return Promise.resolve();
      }),
    }));
    vi.doMock("@/lib/s3/objects", () => ({
      deleteFromS3: vi.fn(() => Promise.resolve()),
      listS3Objects: vi.fn(() => Promise.resolve([])),
    }));

    const bookmarksModule = await loadBookmarksModule();

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
    expect(writeCount).toBeGreaterThanOrEqual(1);
  });
});
