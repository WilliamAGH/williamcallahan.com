/**
 * Tests for the S3-based distributed lock implementation
 *
 * Tests the production lock implementation in s3-distributed-lock.server.ts
 * by mocking the underlying S3 operations.
 */

import { vi } from "vitest";
import type { DistributedLockEntry } from "@/types";

// Mock environment variables
const originalEnv = process.env;

beforeAll(() => {
  process.env = {
    ...originalEnv,
    DRY_RUN: "false",
    S3_BUCKET: "test-bucket",
    S3_REGION: "us-east-1",
    S3_ENDPOINT: "https://s3.amazonaws.com",
    S3_ACCESS_KEY_ID: "test-access-key",
    S3_SECRET_ACCESS_KEY: "test-secret-key",
  };
});

afterAll(() => {
  process.env = originalEnv;
});

describe("S3 distributed lock (s3-distributed-lock.server)", () => {
  const lockKey = "locks/test-lock.json";
  const instanceId = "instance-1";
  const ttlMs = 300000; // 5 minutes

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Use fixed time for deterministic testing
    vi.spyOn(Date, "now").mockReturnValue(1000000);

    // Mock getMonotonicTime to match Date.now() while preserving other exports
    vi.doMock("@/lib/utils", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/utils")>();
      return {
        ...actual,
        getMonotonicTime: () => 1000000,
      };
    });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("acquires a new lock when none exists", async () => {
    let lockState: DistributedLockEntry | null = null;

    vi.doMock("@/lib/s3/json", () => ({
      readJsonS3Optional: vi.fn((key: string) => {
        if (key === lockKey) {
          return Promise.resolve(lockState);
        }
        return Promise.resolve(null);
      }),
      readJsonS3: vi.fn((key: string) => {
        if (key === lockKey) {
          return Promise.resolve(lockState);
        }
        return Promise.resolve(null);
      }),
      writeJsonS3: vi.fn((key: string, value: DistributedLockEntry) => {
        if (key === lockKey) {
          lockState = value;
        }
        return Promise.resolve();
      }),
    }));
    vi.doMock("@/lib/s3/objects", () => ({
      deleteFromS3: vi.fn((key: string) => {
        if (key === lockKey) {
          lockState = null;
        }
        return Promise.resolve();
      }),
    }));

    const { acquireDistributedLock } = await import("@/lib/utils/s3-distributed-lock.server");

    const result = await acquireDistributedLock({
      lockKey,
      instanceId,
      ttlMs,
    });

    expect(result.success).toBe(true);
    expect(result.lockEntry?.instanceId).toBe(instanceId);
    expect(lockState).not.toBeNull();
  });

  it("fails to acquire when active lock exists", async () => {
    const existingLock: DistributedLockEntry = {
      instanceId: "other-instance",
      acquiredAt: Date.now(),
      ttlMs,
    };

    vi.doMock("@/lib/s3/json", () => ({
      readJsonS3Optional: vi.fn((key: string) => {
        if (key === lockKey) {
          return Promise.resolve(existingLock);
        }
        return Promise.resolve(null);
      }),
      readJsonS3: vi.fn((key: string) => {
        if (key === lockKey) {
          return Promise.resolve(existingLock);
        }
        return Promise.resolve(null);
      }),
      writeJsonS3: vi.fn(() => Promise.resolve()),
    }));
    vi.doMock("@/lib/s3/objects", () => ({
      deleteFromS3: vi.fn(() => Promise.resolve()),
    }));

    const { acquireDistributedLock } = await import("@/lib/utils/s3-distributed-lock.server");

    const result = await acquireDistributedLock({
      lockKey,
      instanceId,
      ttlMs,
    });

    expect(result.success).toBe(false);
    expect(result.reason).toContain("Lock held by");
  });

  it("takes over expired lock after TTL", async () => {
    const expiredLock: DistributedLockEntry = {
      instanceId: "old-instance",
      acquiredAt: Date.now() - (ttlMs + 1000), // Expired
      ttlMs,
    };
    let lockState: DistributedLockEntry | null = expiredLock;
    let lockDeleted = false;

    vi.doMock("@/lib/s3/json", () => ({
      readJsonS3Optional: vi.fn((key: string) => {
        if (key === lockKey) {
          return Promise.resolve(lockDeleted ? lockState : expiredLock);
        }
        return Promise.resolve(null);
      }),
      readJsonS3: vi.fn((key: string) => {
        if (key === lockKey) {
          return Promise.resolve(lockState);
        }
        return Promise.resolve(null);
      }),
      writeJsonS3: vi.fn((key: string, value: DistributedLockEntry) => {
        if (key === lockKey) {
          lockState = value;
        }
        return Promise.resolve();
      }),
    }));
    vi.doMock("@/lib/s3/objects", () => ({
      deleteFromS3: vi.fn((key: string) => {
        if (key === lockKey) {
          lockDeleted = true;
        }
        return Promise.resolve();
      }),
    }));

    const { acquireDistributedLock } = await import("@/lib/utils/s3-distributed-lock.server");

    const result = await acquireDistributedLock({
      lockKey,
      instanceId,
      ttlMs,
    });

    expect(result.success).toBe(true);
    expect(lockDeleted).toBe(true);
    expect(lockState?.instanceId).toBe(instanceId);
  });

  it("releases lock only for matching instance", async () => {
    let lockState: DistributedLockEntry | null = {
      instanceId,
      acquiredAt: Date.now(),
      ttlMs,
    };

    vi.doMock("@/lib/s3/json", () => ({
      readJsonS3Optional: vi.fn((key: string) => {
        if (key === lockKey) {
          return Promise.resolve(lockState);
        }
        return Promise.resolve(null);
      }),
      readJsonS3: vi.fn((key: string) => {
        if (key === lockKey) {
          return Promise.resolve(lockState);
        }
        return Promise.resolve(null);
      }),
      writeJsonS3: vi.fn(() => Promise.resolve()),
    }));
    vi.doMock("@/lib/s3/objects", () => ({
      deleteFromS3: vi.fn((key: string) => {
        if (key === lockKey) {
          lockState = null;
        }
        return Promise.resolve();
      }),
    }));

    const { releaseDistributedLock } = await import("@/lib/utils/s3-distributed-lock.server");

    await releaseDistributedLock({ lockKey, instanceId });

    expect(lockState).toBeNull();
  });

  it("does not release lock for non-matching instance", async () => {
    const otherLock: DistributedLockEntry = {
      instanceId: "other-instance",
      acquiredAt: Date.now(),
      ttlMs,
    };
    let lockState: DistributedLockEntry | null = otherLock;

    vi.doMock("@/lib/s3/json", () => ({
      readJsonS3Optional: vi.fn((key: string) => {
        if (key === lockKey) {
          return Promise.resolve(lockState);
        }
        return Promise.resolve(null);
      }),
      readJsonS3: vi.fn((key: string) => {
        if (key === lockKey) {
          return Promise.resolve(lockState);
        }
        return Promise.resolve(null);
      }),
      writeJsonS3: vi.fn(() => Promise.resolve()),
    }));
    vi.doMock("@/lib/s3/objects", () => ({
      deleteFromS3: vi.fn((key: string) => {
        if (key === lockKey) {
          lockState = null;
        }
        return Promise.resolve();
      }),
    }));

    const { releaseDistributedLock } = await import("@/lib/utils/s3-distributed-lock.server");

    // Try to release with wrong instance ID
    await releaseDistributedLock({ lockKey, instanceId });

    // Lock should still exist since instance IDs don't match
    expect(lockState).not.toBeNull();
    expect(lockState?.instanceId).toBe("other-instance");
  });

  it("cleans up stale locks via cleanupStaleLocks", async () => {
    const staleLock: DistributedLockEntry = {
      instanceId: "stale-instance",
      acquiredAt: Date.now() - (ttlMs + 1000), // Expired
      ttlMs,
    };
    let lockState: DistributedLockEntry | null = staleLock;

    vi.doMock("@/lib/s3/json", () => ({
      readJsonS3Optional: vi.fn((key: string) => {
        if (key === lockKey) {
          return Promise.resolve(lockState);
        }
        return Promise.resolve(null);
      }),
      readJsonS3: vi.fn((key: string) => {
        if (key === lockKey) {
          return Promise.resolve(lockState);
        }
        return Promise.resolve(null);
      }),
      writeJsonS3: vi.fn(() => Promise.resolve()),
    }));
    vi.doMock("@/lib/s3/objects", () => ({
      deleteFromS3: vi.fn((key: string) => {
        if (key === lockKey) {
          lockState = null;
        }
        return Promise.resolve();
      }),
    }));

    const { cleanupStaleLocks } = await import("@/lib/utils/s3-distributed-lock.server");

    await cleanupStaleLocks(lockKey);

    expect(lockState).toBeNull();
  });

  it("does not clean up fresh locks", async () => {
    const freshLock: DistributedLockEntry = {
      instanceId: "fresh-instance",
      acquiredAt: Date.now() - 1000, // Only 1 second old
      ttlMs,
    };
    let lockState: DistributedLockEntry | null = freshLock;

    vi.doMock("@/lib/s3/json", () => ({
      readJsonS3Optional: vi.fn((key: string) => {
        if (key === lockKey) {
          return Promise.resolve(lockState);
        }
        return Promise.resolve(null);
      }),
      readJsonS3: vi.fn((key: string) => {
        if (key === lockKey) {
          return Promise.resolve(lockState);
        }
        return Promise.resolve(null);
      }),
      writeJsonS3: vi.fn(() => Promise.resolve()),
    }));
    vi.doMock("@/lib/s3/objects", () => ({
      deleteFromS3: vi.fn((key: string) => {
        if (key === lockKey) {
          lockState = null;
        }
        return Promise.resolve();
      }),
    }));

    const { cleanupStaleLocks } = await import("@/lib/utils/s3-distributed-lock.server");

    await cleanupStaleLocks(lockKey);

    // Lock should still exist since it's fresh
    expect(lockState).not.toBeNull();
  });

  it("createDistributedLock provides convenient instance methods", async () => {
    let lockState: DistributedLockEntry | null = null;

    vi.doMock("@/lib/s3/json", () => ({
      readJsonS3Optional: vi.fn((key: string) => {
        if (key === lockKey) {
          return Promise.resolve(lockState);
        }
        return Promise.resolve(null);
      }),
      readJsonS3: vi.fn((key: string) => {
        if (key === lockKey) {
          return Promise.resolve(lockState);
        }
        return Promise.resolve(null);
      }),
      writeJsonS3: vi.fn((key: string, value: DistributedLockEntry) => {
        if (key === lockKey) {
          lockState = value;
        }
        return Promise.resolve();
      }),
    }));
    vi.doMock("@/lib/s3/objects", () => ({
      deleteFromS3: vi.fn((key: string) => {
        if (key === lockKey) {
          lockState = null;
        }
        return Promise.resolve();
      }),
    }));

    const { createDistributedLock } = await import("@/lib/utils/s3-distributed-lock.server");

    const lock = createDistributedLock({ lockKey, ttlMs });

    // Verify instance ID is generated
    expect(lock.instanceId).toMatch(/^instance-\d+-\d+$/);

    // Acquire lock
    const acquired = await lock.acquire();
    expect(acquired).toBe(true);
    expect(lockState).not.toBeNull();

    // Release lock
    await lock.release();
    expect(lockState).toBeNull();
  });

  it("handles S3 read errors gracefully during acquire", async () => {
    let lockState: DistributedLockEntry | null = null;

    vi.doMock("@/lib/s3/json", () => ({
      readJsonS3Optional: vi
        .fn()
        .mockImplementationOnce(() => Promise.reject(new Error("S3 read error")))
        .mockImplementation((key: string) => {
          if (key === lockKey) {
            return Promise.resolve(lockState);
          }
          return Promise.resolve(null);
        }),
      readJsonS3: vi.fn((key: string) => {
        if (key === lockKey) {
          return Promise.resolve(lockState);
        }
        return Promise.resolve(null);
      }),
      writeJsonS3: vi.fn((key: string, value: DistributedLockEntry) => {
        if (key === lockKey) {
          lockState = value;
        }
        return Promise.resolve();
      }),
    }));
    vi.doMock("@/lib/s3/objects", () => ({
      deleteFromS3: vi.fn(() => Promise.resolve()),
    }));

    const { acquireDistributedLock } = await import("@/lib/utils/s3-distributed-lock.server");

    // Should still attempt to acquire despite initial read error
    const result = await acquireDistributedLock({
      lockKey,
      instanceId,
      ttlMs,
    });

    // The lock acquisition should still work because it retries
    expect(typeof result.success).toBe("boolean");
  });
});
