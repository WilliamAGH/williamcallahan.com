import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { BOOKMARKS_S3_PATHS, BOOKMARKS_PER_PAGE } from "@/lib/constants";
import type { UnifiedBookmark, BookmarksIndex } from "@/types";

describe("hasBookmarksChanged() function (unit)", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.SELECTIVE_OG_REFRESH = "true";
    process.env.MIN_BOOKMARKS_THRESHOLD = "1";
  });

  it("returns true when no existing index exists", async () => {
    jest.resetModules();

    let lockState: unknown = null;
    const writeJsonS3Mock = jest.fn((key: string, value: unknown) => {
      if (key === BOOKMARKS_S3_PATHS.LOCK) {
        lockState = value;
      }
      return Promise.resolve();
    });
    const readJsonS3Mock = jest.fn((key: string) => {
      if (key === BOOKMARKS_S3_PATHS.LOCK) {
        return Promise.resolve(lockState);
      }
      return Promise.resolve(null);
    });
    const deleteFromS3Mock = jest.fn((key: string) => {
      if (key === BOOKMARKS_S3_PATHS.LOCK) {
        lockState = null;
      }
      return Promise.resolve();
    });

    jest.doMock("@/lib/s3-utils", () => ({
      readJsonS3: readJsonS3Mock,
      writeJsonS3: writeJsonS3Mock,
      deleteFromS3: deleteFromS3Mock,
      listS3Objects: jest.fn(() => Promise.resolve([])),
    }));

    const bookmarksModule = await import("@/lib/bookmarks/refresh-logic.server");

    const mockBookmarks: UnifiedBookmark[] = [
      {
        id: "test-1",
        url: "https://example.com",
        title: "Test Bookmark",
        description: "Test description",
        tags: [],
        dateBookmarked: "2024-01-01T00:00:00.000Z",
        sourceUpdatedAt: "2024-01-01T00:00:00.000Z",
      },
    ];

    bookmarksModule.setRefreshBookmarksCallback(() => Promise.resolve(mockBookmarks));
    bookmarksModule.initializeBookmarksDataAccess();

    await bookmarksModule.refreshAndPersistBookmarks();
    bookmarksModule.cleanupBookmarksDataAccess();

    const writeCalls = writeJsonS3Mock.mock.calls;
    const indexWrite = writeCalls.find((call) => call[0] === BOOKMARKS_S3_PATHS.INDEX);
    const pageWrite = writeCalls.find(
      (call) => typeof call[0] === "string" && call[0].includes("page-1.json"),
    );

    expect(indexWrite).toBeDefined();
    expect(pageWrite).toBeDefined();
    const [, indexPayload] = indexWrite as [string, { changeDetected: boolean }];
    expect(indexPayload.changeDetected).toBe(true);
  });

  it("returns true when bookmark count changes", async () => {
    jest.resetModules();
    const existingIndex: BookmarksIndex = {
      count: 5,
      totalPages: 1,
      pageSize: BOOKMARKS_PER_PAGE,
      lastModified: new Date().toISOString(),
      lastFetchedAt: Date.now() - 3600000,
      lastAttemptedAt: Date.now() - 3600000,
      checksum: "old-checksum",
      changeDetected: false,
    };

    let lockState: unknown = null;
    const writeJsonS3Mock = jest.fn((key: string, value: unknown) => {
      if (key === BOOKMARKS_S3_PATHS.LOCK) {
        lockState = value;
      }
      return Promise.resolve();
    });
    const readJsonS3Mock = jest.fn((key: string) => {
      if (key === BOOKMARKS_S3_PATHS.LOCK) {
        return Promise.resolve(lockState);
      }
      if (key === BOOKMARKS_S3_PATHS.INDEX) {
        return Promise.resolve(existingIndex);
      }
      return Promise.resolve(null);
    });
    const deleteFromS3Mock = jest.fn((key: string) => {
      if (key === BOOKMARKS_S3_PATHS.LOCK) {
        lockState = null;
      }
      return Promise.resolve();
    });

    jest.doMock("@/lib/s3-utils", () => ({
      readJsonS3: readJsonS3Mock,
      writeJsonS3: writeJsonS3Mock,
      deleteFromS3: deleteFromS3Mock,
      listS3Objects: jest.fn(() => Promise.resolve([])),
    }));

    const bookmarksModule = await import("@/lib/bookmarks/refresh-logic.server");

    const mockBookmarks: UnifiedBookmark[] = [
      {
        id: "test-1",
        url: "https://example.com/1",
        title: "Test 1",
        description: "Test 1",
        tags: [],
        dateBookmarked: "2024-01-01T00:00:00.000Z",
        sourceUpdatedAt: "2024-01-01T00:00:00.000Z",
      },
      {
        id: "test-2",
        url: "https://example.com/2",
        title: "Test 2",
        description: "Test 2",
        tags: [],
        dateBookmarked: "2024-01-01T00:00:00.000Z",
        sourceUpdatedAt: "2024-01-01T00:00:00.000Z",
      },
      {
        id: "test-3",
        url: "https://example.com/3",
        title: "Test 3",
        description: "Test 3",
        tags: [],
        dateBookmarked: "2024-01-01T00:00:00.000Z",
        sourceUpdatedAt: "2024-01-01T00:00:00.000Z",
      },
    ];

    bookmarksModule.setRefreshBookmarksCallback(() => Promise.resolve(mockBookmarks));
    bookmarksModule.initializeBookmarksDataAccess();

    await bookmarksModule.refreshAndPersistBookmarks();
    bookmarksModule.cleanupBookmarksDataAccess();

    const writeCalls = writeJsonS3Mock.mock.calls;
    const indexWrite = writeCalls.find((call) => call[0] === BOOKMARKS_S3_PATHS.INDEX);
    const pageWrite = writeCalls.find(
      (call) => typeof call[0] === "string" && call[0].includes("page-1.json"),
    );

    expect(indexWrite).toBeDefined();
    expect(pageWrite).toBeDefined();
    const [, indexPayload] = indexWrite as [string, { changeDetected: boolean; count: number }];
    expect(indexPayload.changeDetected).toBe(true);
    expect(indexPayload.count).toBe(3);
  });

  it("returns true when checksum changes (same count, different content)", async () => {
    jest.resetModules();
    const existingIndex: BookmarksIndex = {
      count: 2,
      totalPages: 1,
      pageSize: BOOKMARKS_PER_PAGE,
      lastModified: new Date().toISOString(),
      lastFetchedAt: Date.now() - 3600000,
      lastAttemptedAt: Date.now() - 3600000,
      checksum: "a:2024-01-01T00:00:00.000Z|b:2024-01-01T00:00:00.000Z",
      changeDetected: false,
    };

    let lockState: unknown = null;
    const writeJsonS3Mock = jest.fn((key: string, value: unknown) => {
      if (key === BOOKMARKS_S3_PATHS.LOCK) {
        lockState = value;
      }
      return Promise.resolve();
    });
    const readJsonS3Mock = jest.fn((key: string) => {
      if (key === BOOKMARKS_S3_PATHS.LOCK) {
        return Promise.resolve(lockState);
      }
      if (key === BOOKMARKS_S3_PATHS.INDEX) {
        return Promise.resolve(existingIndex);
      }
      return Promise.resolve(null);
    });
    const deleteFromS3Mock = jest.fn((key: string) => {
      if (key === BOOKMARKS_S3_PATHS.LOCK) {
        lockState = null;
      }
      return Promise.resolve();
    });

    jest.doMock("@/lib/s3-utils", () => ({
      readJsonS3: readJsonS3Mock,
      writeJsonS3: writeJsonS3Mock,
      deleteFromS3: deleteFromS3Mock,
      listS3Objects: jest.fn(() => Promise.resolve([])),
    }));

    const bookmarksModule = await import("@/lib/bookmarks/refresh-logic.server");

    const mockBookmarks: UnifiedBookmark[] = [
      {
        id: "different-1",
        url: "https://example.com/1",
        title: "Different 1",
        description: "Different 1",
        tags: [],
        dateBookmarked: "2024-02-01T00:00:00.000Z",
        sourceUpdatedAt: "2024-02-01T00:00:00.000Z",
      },
      {
        id: "different-2",
        url: "https://example.com/2",
        title: "Different 2",
        description: "Different 2",
        tags: [],
        dateBookmarked: "2024-02-01T00:00:00.000Z",
        sourceUpdatedAt: "2024-02-01T00:00:00.000Z",
      },
    ];

    bookmarksModule.setRefreshBookmarksCallback(() => Promise.resolve(mockBookmarks));
    bookmarksModule.initializeBookmarksDataAccess();

    await bookmarksModule.refreshAndPersistBookmarks();
    bookmarksModule.cleanupBookmarksDataAccess();

    const writeCalls = writeJsonS3Mock.mock.calls;
    const indexWrite = writeCalls.find((call) => call[0] === BOOKMARKS_S3_PATHS.INDEX);
    const pageWrite = writeCalls.find(
      (call) => typeof call[0] === "string" && call[0].includes("page-1.json"),
    );

    expect(indexWrite).toBeDefined();
    expect(pageWrite).toBeDefined();
    const [, indexPayload] = indexWrite as [string, { changeDetected: boolean; count: number }];
    expect(indexPayload.changeDetected).toBe(true);
    expect(indexPayload.count).toBe(2);
  });

  it("returns false when nothing changes", async () => {
    jest.resetModules();
    const testDate = "2024-01-01T00:00:00.000Z";
    const existingIndex: BookmarksIndex = {
      count: 2,
      totalPages: 1,
      pageSize: BOOKMARKS_PER_PAGE,
      lastModified: new Date().toISOString(),
      lastFetchedAt: Date.now() - 3600000,
      lastAttemptedAt: Date.now() - 3600000,
      checksum: "a:2024-01-01T00:00:00.000Z|b:2024-01-01T00:00:00.000Z",
      changeDetected: false,
    };

    let lockState: unknown = null;
    const writeJsonS3Mock = jest.fn((key: string, value: unknown) => {
      if (key === BOOKMARKS_S3_PATHS.LOCK) {
        lockState = value;
      }
      return Promise.resolve();
    });
    const readJsonS3Mock = jest.fn((key: string) => {
      if (key === BOOKMARKS_S3_PATHS.LOCK) {
        return Promise.resolve(lockState);
      }
      if (key === BOOKMARKS_S3_PATHS.INDEX) {
        return Promise.resolve(existingIndex);
      }
      return Promise.resolve(null);
    });
    const deleteFromS3Mock = jest.fn((key: string) => {
      if (key === BOOKMARKS_S3_PATHS.LOCK) {
        lockState = null;
      }
      return Promise.resolve();
    });

    jest.doMock("@/lib/s3-utils", () => ({
      readJsonS3: readJsonS3Mock,
      writeJsonS3: writeJsonS3Mock,
      deleteFromS3: deleteFromS3Mock,
      listS3Objects: jest.fn(() => Promise.resolve([])),
    }));

    jest.doMock("@/lib/bookmarks/enrich-opengraph", () => ({
      processBookmarksInBatches: jest.fn((bookmarks: UnifiedBookmark[]) =>
        Promise.resolve(bookmarks),
      ),
    }));

    const bookmarksModule = await import("@/lib/bookmarks/refresh-logic.server");

    const mockBookmarks: UnifiedBookmark[] = [
      {
        id: "a",
        url: "https://example.com/1",
        title: "Test A",
        description: "Test A",
        tags: [],
        dateBookmarked: testDate,
        sourceUpdatedAt: testDate,
        modifiedAt: testDate,
      },
      {
        id: "b",
        url: "https://example.com/2",
        title: "Test B",
        description: "Test B",
        tags: [],
        dateBookmarked: testDate,
        sourceUpdatedAt: testDate,
        modifiedAt: testDate,
      },
    ];

    bookmarksModule.setRefreshBookmarksCallback(() => Promise.resolve(mockBookmarks));
    bookmarksModule.initializeBookmarksDataAccess();

    await bookmarksModule.refreshAndPersistBookmarks();
    bookmarksModule.cleanupBookmarksDataAccess();

    const writeCalls = writeJsonS3Mock.mock.calls;
    const indexWrite = writeCalls.find((call) => call[0] === BOOKMARKS_S3_PATHS.INDEX);
    const heartbeatWrite = writeCalls.find((call) => call[0] === BOOKMARKS_S3_PATHS.HEARTBEAT);

    expect(indexWrite).toBeDefined();
    expect(heartbeatWrite).toBeDefined();
    const [, indexPayload] = indexWrite as [
      string,
      { changeDetected: boolean; count: number; lastFetchedAt: number },
    ];
    expect(indexPayload.changeDetected).toBe(false);
    expect(indexPayload.count).toBe(2);
    expect(indexPayload.lastFetchedAt).toBeGreaterThan(existingIndex.lastFetchedAt ?? 0);
  });

  it("returns true on S3 read errors (safe default)", async () => {
    jest.resetModules();
    let lockState: unknown = null;
    const writeJsonS3Mock = jest.fn((key: string, value: unknown) => {
      if (key === BOOKMARKS_S3_PATHS.LOCK) {
        lockState = value;
      }
      return Promise.resolve();
    });
    const readJsonS3Mock = jest.fn((key: string) => {
      if (key === BOOKMARKS_S3_PATHS.LOCK) {
        return Promise.resolve(lockState);
      }
      if (key === BOOKMARKS_S3_PATHS.INDEX) {
        throw new Error("S3 connection failed");
      }
      return Promise.resolve(null);
    });
    const deleteFromS3Mock = jest.fn((key: string) => {
      if (key === BOOKMARKS_S3_PATHS.LOCK) {
        lockState = null;
      }
      return Promise.resolve();
    });

    jest.doMock("@/lib/s3-utils", () => ({
      readJsonS3: readJsonS3Mock,
      writeJsonS3: writeJsonS3Mock,
      deleteFromS3: deleteFromS3Mock,
      listS3Objects: jest.fn(() => Promise.resolve([])),
    }));

    const bookmarksModule = await import("@/lib/bookmarks/refresh-logic.server");

    const mockBookmarks: UnifiedBookmark[] = [
      {
        id: "test-1",
        url: "https://example.com",
        title: "Test Bookmark",
        description: "Test description",
        tags: [],
        dateBookmarked: "2024-01-01T00:00:00.000Z",
        sourceUpdatedAt: "2024-01-01T00:00:00.000Z",
      },
    ];

    bookmarksModule.setRefreshBookmarksCallback(() => Promise.resolve(mockBookmarks));
    bookmarksModule.initializeBookmarksDataAccess();

    await bookmarksModule.refreshAndPersistBookmarks();
    bookmarksModule.cleanupBookmarksDataAccess();

    const writeCalls = writeJsonS3Mock.mock.calls;
    const indexWrite = writeCalls.find((call) => call[0] === BOOKMARKS_S3_PATHS.INDEX);
    const pageWrite = writeCalls.find(
      (call) => typeof call[0] === "string" && call[0].includes("page-1.json"),
    );

    expect(indexWrite).toBeDefined();
    expect(pageWrite).toBeDefined();
    const [, indexPayload] = indexWrite as [string, { changeDetected: boolean }];
    expect(indexPayload.changeDetected).toBe(true);
  });
});
