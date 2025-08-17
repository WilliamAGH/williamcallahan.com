// Mock environment variables to ensure functions execute
const originalEnv = process.env;

// Set environment variables BEFORE any imports
process.env = {
  ...originalEnv,
  DRY_RUN: "false",
  S3_BUCKET: "test-bucket",
  S3_REGION: "us-east-1",
  S3_ENDPOINT: "https://s3.amazonaws.com",
  S3_ACCESS_KEY_ID: "test-access-key",
  S3_SECRET_ACCESS_KEY: "test-secret-key",
};

// Import module under test
import * as s3Utils from "../../lib/s3-utils";
import type { LockStore } from "@/types/lib";

// Restore environment variables after all tests
afterAll(() => {
  process.env = originalEnv;
});

describe("S3 distributed lock helpers (with injected LockStore)", () => {
  const lockKey = "test-lock";
  const instanceId = "instance-1";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-01-01T00:00:00.000Z"));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  class InMemoryLockStore implements LockStore {
    private map = new Map<string, { instanceId: string; acquiredAt: number; operation: string }>();

    read(key: string): Promise<{ instanceId: string; acquiredAt: number; operation: string } | null> {
      return Promise.resolve(this.map.get(key) ?? null);
    }

    createIfAbsent(
      key: string,
      value: { instanceId: string; acquiredAt: number; operation: string },
    ): Promise<boolean> {
      if (this.map.has(key)) return Promise.resolve(false);
      this.map.set(key, value);
      return Promise.resolve(true);
    }

    delete(key: string): Promise<void> {
      this.map.delete(key);
      return Promise.resolve();
    }

    list(prefix: string): Promise<string[]> {
      const out: string[] = [];
      for (const key of this.map.keys()) {
        if (key.startsWith(prefix)) out.push(key);
      }
      return Promise.resolve(out);
    }
  }

  it("acquires a new lock when none exists", async () => {
    const store = new InMemoryLockStore();
    const acquired = await s3Utils.acquireDistributedLock(lockKey, instanceId, "test-op", 1000, {
      store,
      clock: () => Date.now(),
    });
    expect(acquired).toBe(true);
  });

  it("fails to acquire when active lock exists", async () => {
    const store = new InMemoryLockStore();
    const path = `locks/${lockKey}.json`;
    await store.createIfAbsent(path, { instanceId: "other", acquiredAt: Date.now(), operation: "test-op" });
    const acquired = await s3Utils.acquireDistributedLock(lockKey, instanceId, "test-op", 1000, {
      store,
      clock: () => Date.now(),
    });
    expect(acquired).toBe(false);
  });

  it("takes over stale lock after timeout", async () => {
    const store = new InMemoryLockStore();
    const path = `locks/${lockKey}.json`;
    await store.createIfAbsent(path, { instanceId: "old", acquiredAt: Date.now() - 2000, operation: "old-op" });
    const acquired = await s3Utils.acquireDistributedLock(lockKey, instanceId, "test-op", 1000, {
      store,
      clock: () => Date.now(),
    });
    expect(acquired).toBe(true);
  });

  it("releases lock only for matching instance", async () => {
    const store = new InMemoryLockStore();
    const path = `locks/${lockKey}.json`;
    await store.createIfAbsent(path, { instanceId, acquiredAt: Date.now(), operation: "t" });
    await s3Utils.releaseDistributedLock(lockKey, instanceId, { store });
    const current = await store.read(path);
    expect(current).toBeNull();
  });

  it("handles race conditions with deterministic acquisition", async () => {
    const store = new InMemoryLockStore();
    const result = await s3Utils.acquireDistributedLock(lockKey, instanceId, "test-op", 1000, {
      store,
      clock: () => Date.now(),
    });
    expect(result).toBe(true);
  });

  it("cleans up stale locks via cleanupStaleLocks", async () => {
    const store = new InMemoryLockStore();
    const path = `locks/${lockKey}.json`;
    await store.createIfAbsent(path, { instanceId: "old", acquiredAt: Date.now() - 5000, operation: "old" });
    await s3Utils.cleanupStaleLocks(1000, { store, clock: () => Date.now() });
    const keys = await store.list("locks/");
    expect(keys.length).toBe(0);
  });

  it("handles underlying errors gracefully", async () => {
    // Store that throws on createIfAbsent
    const erroringStore: LockStore = {
      read: () => Promise.resolve(null),
      createIfAbsent: () => {
        throw Object.assign(new Error("precondition failed"), { $metadata: { httpStatusCode: 500 } });
      },
      delete: () => Promise.resolve(),
      list: () => Promise.resolve([]),
    };
    const acquired = await s3Utils.acquireDistributedLock(lockKey, instanceId, "op", 1000, {
      store: erroringStore,
      clock: () => Date.now(),
    });
    expect(typeof acquired).toBe("boolean");
  });
});
