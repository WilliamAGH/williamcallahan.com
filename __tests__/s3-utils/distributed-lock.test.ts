import { acquireDistributedLock, releaseDistributedLock } from "../../lib/s3-utils";

// Mock S3 JSON helpers
jest.mock("../../lib/s3-utils", () => {
  // Require the original module to not stub unrelated exports
  const original = jest.requireActual("../../lib/s3-utils");
  return {
    __esModule: true,
    ...original,
    readJsonS3: jest.fn(),
    writeJsonS3: jest.fn(),
    deleteFromS3: jest.fn(),
    listS3Objects: jest.fn(),
  };
});

import { readJsonS3, writeJsonS3, deleteFromS3 } from "../../lib/s3-utils";

describe("S3 distributed lock helpers", () => {
  const lockKey = "test-lock";
  const instanceId = "instance-1";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("acquires a new lock when none exists", async () => {
    (readJsonS3 as jest.Mock).mockResolvedValue(null);
    (writeJsonS3 as jest.Mock).mockResolvedValue(undefined);

    const acquired = await acquireDistributedLock(lockKey, instanceId, "test-op", 1000);
    expect(acquired).toBe(true);
    expect(writeJsonS3).toHaveBeenCalledTimes(1);
  });

  it("fails to acquire when active lock exists", async () => {
    const activeLock = { instanceId: "other", acquiredAt: Date.now(), operation: "test-op" };
    (readJsonS3 as jest.Mock).mockResolvedValue(activeLock);

    const acquired = await acquireDistributedLock(lockKey, instanceId, "test-op", 1000);
    expect(acquired).toBe(false);
    expect(writeJsonS3).not.toHaveBeenCalled();
  });

  it("takes over stale lock after timeout", async () => {
    const staleLock = { instanceId: "old", acquiredAt: Date.now() - 2000, operation: "old-op" };
    (readJsonS3 as jest.Mock).mockResolvedValue(staleLock);
    (writeJsonS3 as jest.Mock).mockResolvedValue(undefined);

    const acquired = await acquireDistributedLock(lockKey, instanceId, "test-op", 1000);
    expect(acquired).toBe(true);
    expect(writeJsonS3).toHaveBeenCalled();
  });

  it("releases lock only for matching instance", async () => {
    const myLock = { instanceId, acquiredAt: Date.now(), operation: "t" };
    (readJsonS3 as jest.Mock).mockResolvedValue(myLock);

    await releaseDistributedLock(lockKey, instanceId);
    expect(deleteFromS3).toHaveBeenCalledWith(`locks/${lockKey}.json`);
  });

  it("allows only one concurrent acquisition (race)", async () => {
    let currentLock: any = null;
    (readJsonS3 as jest.Mock).mockImplementation(() => currentLock);
    (writeJsonS3 as jest.Mock).mockImplementation((_key: string, data: any) => {
      currentLock = data;
      return Promise.resolve();
    });

    const [first, second] = await Promise.all([
      acquireDistributedLock(lockKey, instanceId, "op", 1000),
      acquireDistributedLock(lockKey, "instance-2", "op", 1000),
    ]);

    expect(first !== second).toBe(true); // one true, one false
    expect(writeJsonS3).toHaveBeenCalledTimes(1);
  });

  it("cleans up stale locks via cleanupStaleLocks", async () => {
    const { cleanupStaleLocks } = jest.requireActual("../../lib/s3-utils");
    (listS3Objects as jest.Mock).mockResolvedValue(["locks/test-lock.json"]);
    const staleLock = { instanceId: "old", acquiredAt: Date.now() - 5000, operation: "old" };
    (readJsonS3 as jest.Mock).mockResolvedValue(staleLock);

    await cleanupStaleLocks(1000);
    expect(deleteFromS3).toHaveBeenCalledWith("locks/test-lock.json");
  });

  it("handles underlying errors gracefully", async () => {
    (readJsonS3 as jest.Mock).mockRejectedValue(new Error("S3 failure"));
    const acquired = await acquireDistributedLock(lockKey, instanceId, "op", 1000);
    expect(acquired).toBe(false);
  });
});
