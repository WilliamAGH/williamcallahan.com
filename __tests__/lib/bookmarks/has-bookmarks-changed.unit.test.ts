import { vi } from "vitest";
import { BOOKMARKS_S3_PATHS, BOOKMARKS_PER_PAGE } from "@/lib/constants";
import type { UnifiedBookmark, BookmarksIndex } from "@/types";

// Mocks setup
const mockReadJsonS3 = vi.fn();
const mockWriteJsonS3 = vi.fn();
const mockDeleteFromS3 = vi.fn();
const mockListS3Objects = vi.fn();
const mockProcessBookmarksInBatches = vi.fn();

vi.mock("@/lib/s3/json", () => ({
  // Match real readJsonS3Optional behavior: only S3NotFoundError returns null, others rethrow
  // RC2: Let errors surface - don't swallow non-NotFound errors
  readJsonS3Optional: async (...args: unknown[]) => {
    try {
      return await mockReadJsonS3(...args);
    } catch (error) {
      // Only S3NotFoundError returns null; all other errors propagate
      if (
        error instanceof Error &&
        (error.name === "S3NotFoundError" || error.message.includes("NoSuchKey"))
      ) {
        return null;
      }
      throw error; // RC2: Let errors surface
    }
  },
  readJsonS3: (...args: unknown[]) => mockReadJsonS3(...args),
  writeJsonS3: (...args: unknown[]) => mockWriteJsonS3(...args),
}));

vi.mock("@/lib/s3/objects", () => ({
  deleteFromS3: (...args: any[]) => mockDeleteFromS3(...args),
  listS3Objects: (...args: any[]) => mockListS3Objects(...args),
}));

vi.mock("@/lib/bookmarks/enrich-opengraph", () => ({
  processBookmarksInBatches: (...args: any[]) => mockProcessBookmarksInBatches(...args),
}));

vi.mock("@/lib/utils/s3-distributed-lock.server", () => ({
  createDistributedLock: () => ({
    acquire: vi.fn().mockResolvedValue(true),
    release: vi.fn().mockResolvedValue(undefined),
  }),
  cleanupStaleLocks: vi.fn().mockResolvedValue(undefined),
}));

// Import module under test
import * as bookmarksModule from "@/lib/bookmarks/refresh-logic.server";

describe("hasBookmarksChanged() function (unit)", () => {
  let lockState: unknown = null;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SELECTIVE_OG_REFRESH = "true";
    process.env.MIN_BOOKMARKS_THRESHOLD = "1";
    lockState = null;

    // Default mock implementations
    mockReadJsonS3.mockImplementation((key: string) => {
      if (key === BOOKMARKS_S3_PATHS.LOCK) return Promise.resolve(lockState);
      return Promise.resolve(null);
    });

    mockWriteJsonS3.mockImplementation((key: string, value: unknown) => {
      if (key === BOOKMARKS_S3_PATHS.LOCK) lockState = value;
      return Promise.resolve();
    });

    mockDeleteFromS3.mockImplementation((key: string) => {
      if (key === BOOKMARKS_S3_PATHS.LOCK) lockState = null;
      return Promise.resolve();
    });

    mockListS3Objects.mockResolvedValue([]);
    mockProcessBookmarksInBatches.mockImplementation((bookmarks) => Promise.resolve(bookmarks));
  });

  afterEach(() => {
    bookmarksModule.cleanupBookmarksDataAccess();
  });

  it("returns true when no existing index exists", async () => {
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

    const writeCalls = mockWriteJsonS3.mock.calls;
    console.log(
      "Written keys:",
      writeCalls.map((c) => c[0]),
    );
    console.log("Expected index key:", BOOKMARKS_S3_PATHS.INDEX);

    const keys = writeCalls.map((c) => c[0]);
    if (!keys.includes(BOOKMARKS_S3_PATHS.INDEX)) {
      console.error("Index key not found in written keys:", keys);
    }

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

    mockReadJsonS3.mockImplementation((key: string) => {
      if (key === BOOKMARKS_S3_PATHS.LOCK) return Promise.resolve(lockState);
      if (key === BOOKMARKS_S3_PATHS.INDEX) return Promise.resolve(existingIndex);
      return Promise.resolve(null);
    });

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

    const writeCalls = mockWriteJsonS3.mock.calls;
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

    mockReadJsonS3.mockImplementation((key: string) => {
      if (key === BOOKMARKS_S3_PATHS.LOCK) return Promise.resolve(lockState);
      if (key === BOOKMARKS_S3_PATHS.INDEX) return Promise.resolve(existingIndex);
      return Promise.resolve(null);
    });

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

    const writeCalls = mockWriteJsonS3.mock.calls;
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

    mockReadJsonS3.mockImplementation((key: string) => {
      if (key === BOOKMARKS_S3_PATHS.LOCK) return Promise.resolve(lockState);
      if (key === BOOKMARKS_S3_PATHS.INDEX) return Promise.resolve(existingIndex);
      return Promise.resolve(null);
    });

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

    const writeCalls = mockWriteJsonS3.mock.calls;
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

  it("returns true when index not found in S3 (safe default)", async () => {
    // Simulate S3NotFoundError - readJsonS3Optional returns null for this case
    const s3NotFoundError = new Error("NoSuchKey: The specified key does not exist.");
    s3NotFoundError.name = "S3NotFoundError";

    mockReadJsonS3.mockImplementation((key: string) => {
      if (key === BOOKMARKS_S3_PATHS.LOCK) return Promise.resolve(lockState);
      if (key === BOOKMARKS_S3_PATHS.INDEX) return Promise.reject(s3NotFoundError);
      return Promise.resolve(null);
    });

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

    const writeCalls = mockWriteJsonS3.mock.calls;
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
