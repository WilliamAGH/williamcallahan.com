/**
 * S3-based distributed lock implementation
 *
 * Provides a generic, reusable distributed locking mechanism using S3 as the coordination layer.
 * This implementation uses S3's conditional writes to ensure atomicity and includes:
 * - Read-back verification to confirm lock ownership
 * - TTL-based expiration for stale lock cleanup
 * - Exponential backoff with jitter for retries
 *
 * @module s3-distributed-lock
 */

import { readJsonS3, writeJsonS3, deleteFromS3 } from "@/lib/s3-utils";
import { envLogger } from "@/lib/utils/env-logger";
import { getMonotonicTime } from "@/lib/utils";
import type { DistributedLockEntry, LockConfig, LockResult } from "@/types";
import type { DistributedLock } from "@/types/lib";

/**
 * Check if an error is an S3 error with metadata
 */
function isS3Error(error: unknown): error is { $metadata?: { httpStatusCode?: number } } {
  return typeof error === "object" && error !== null && "$metadata" in error;
}

/**
 * Implements exponential backoff with jitter
 */
async function backoffWithJitter(attempt: number): Promise<void> {
  const baseDelay = 100 + 2 ** attempt * 50;
  const jitter = Math.floor(Math.random() * 50);
  await new Promise(resolve => setTimeout(resolve, baseDelay + jitter));
}

/**
 * Acquires a distributed lock using S3 as the coordination layer
 *
 * This implementation uses a three-step process:
 * 1. Check if an active lock exists (fast fail)
 * 2. Attempt to write our lock entry with conditional create
 * 3. Read back and verify ownership
 *
 * @param config - Lock configuration
 * @returns Promise resolving to lock acquisition result
 */
export async function acquireDistributedLock(config: LockConfig): Promise<LockResult> {
  const { lockKey, instanceId, ttlMs, maxRetries = 3, logCategory = "DistributedLock" } = config;

  return attemptLockAcquisition(0);

  async function attemptLockAcquisition(retryCount: number): Promise<LockResult> {
    // Step 1: Check if an active lock exists
    try {
      const existing = await readJsonS3<DistributedLockEntry>(lockKey);
      if (existing && typeof existing === "object") {
        const age = getMonotonicTime() - existing.acquiredAt;
        const isExpired = age >= existing.ttlMs;

        if (!isExpired) {
          envLogger.debug(
            "Active lock exists, backing off",
            { holder: existing.instanceId, ageMs: age, ttlMs: existing.ttlMs },
            { category: logCategory },
          );
          return {
            success: false,
            reason: `Lock held by ${existing.instanceId}, expires in ${existing.ttlMs - age}ms`,
          };
        }

        // Lock is expired, delete it before attempting to acquire
        envLogger.log(
          "Found expired lock, deleting before re-acquire",
          { holder: existing.instanceId, ageMs: age },
          { category: logCategory },
        );

        // Delete the stale lock
        try {
          await deleteFromS3(lockKey);
          envLogger.debug("Expired lock deleted successfully", undefined, { category: logCategory });
        } catch (cleanupError) {
          // Best-effort cleanup; proceed to write and let retries handle contention
          envLogger.debug(`Failed to delete expired lock: ${String(cleanupError)}`, undefined, {
            category: logCategory,
          });
        }
      }
    } catch (error: unknown) {
      if (!isS3Error(error) || error.$metadata?.httpStatusCode !== 404) {
        envLogger.log(`Error reading lock: ${String(error)}`, undefined, { category: logCategory });
      }
    }

    // Step 2: Attempt to write our lock entry
    const myEntry: DistributedLockEntry = {
      instanceId,
      acquiredAt: getMonotonicTime(),
      ttlMs,
    };

    try {
      await writeJsonS3(lockKey, myEntry, { IfNoneMatch: "*" });
    } catch (error: unknown) {
      if (retryCount < maxRetries) {
        await backoffWithJitter(retryCount);
        return attemptLockAcquisition(retryCount + 1);
      }
      return {
        success: false,
        reason: `Failed to write lock after ${maxRetries} attempts: ${String(error)}`,
      };
    }

    // Step 3: Read back and verify ownership
    try {
      const current = await readJsonS3<DistributedLockEntry>(lockKey);
      if (current && current.instanceId === myEntry.instanceId && current.acquiredAt === myEntry.acquiredAt) {
        envLogger.log("Lock acquired", { instanceId }, { category: logCategory });
        return { success: true, lockEntry: myEntry };
      }

      // Another instance won the race
      envLogger.debug(
        "Lost lock race to another instance",
        { ourId: instanceId, winnerId: current?.instanceId },
        { category: logCategory },
      );
      return {
        success: false,
        reason: `Lost race to ${current?.instanceId}`,
      };
    } catch (error: unknown) {
      envLogger.log(`Error verifying lock ownership: ${String(error)}`, undefined, { category: logCategory });
      // Clean up our potentially orphaned lock
      try {
        await deleteFromS3(lockKey);
      } catch {
        // Best effort cleanup
      }
      return {
        success: false,
        reason: `Failed to verify lock ownership: ${String(error)}`,
      };
    }
  }
}

/**
 * Releases a distributed lock
 *
 * @param config - Lock configuration (only lockKey and instanceId are used)
 * @param force - If true, releases the lock regardless of ownership
 * @returns Promise that resolves when lock is released
 */
export async function releaseDistributedLock(
  config: Pick<LockConfig, "lockKey" | "instanceId" | "logCategory">,
  force = false,
): Promise<void> {
  const { lockKey, instanceId, logCategory = "DistributedLock" } = config;

  try {
    const existingLock = await readJsonS3<DistributedLockEntry>(lockKey);
    if (existingLock?.instanceId === instanceId || force) {
      await deleteFromS3(lockKey);
      envLogger.log(force ? "Lock force-released" : "Lock released", { instanceId }, { category: logCategory });
    } else if (existingLock) {
      envLogger.log(
        "Attempted to release lock owned by another instance",
        { ourId: instanceId, ownerId: existingLock.instanceId },
        { category: logCategory },
      );
    }
  } catch (error: unknown) {
    if (!isS3Error(error) || error.$metadata?.httpStatusCode !== 404) {
      envLogger.log(`Error during lock release: ${String(error)}`, undefined, { category: logCategory });
    }
  }
}

/**
 * Cleans up stale locks that have exceeded their TTL
 *
 * @param lockKey - S3 key of the lock to check
 * @param logCategory - Category for logging
 * @returns Promise that resolves when cleanup is complete
 */
export async function cleanupStaleLocks(lockKey: string, logCategory = "DistributedLock"): Promise<void> {
  try {
    const existingLock = await readJsonS3<DistributedLockEntry>(lockKey);
    if (existingLock && typeof existingLock === "object") {
      const age = getMonotonicTime() - existingLock.acquiredAt;
      const expired = age >= existingLock.ttlMs;

      if (expired) {
        envLogger.log(
          "Releasing stale lock",
          { ageMs: age, instanceId: existingLock.instanceId },
          { category: logCategory },
        );
        await deleteFromS3(lockKey);
      }
    }
  } catch (error: unknown) {
    if (!isS3Error(error) || error.$metadata?.httpStatusCode !== 404) {
      envLogger.debug(`Error checking for stale locks: ${String(error)}`, undefined, { category: logCategory });
    }
  }
}

/**
 * Creates a managed lock instance with convenient methods
 *
 * @param config - Lock configuration
 * @returns Object with acquire and release methods
 */
export function createDistributedLock(config: Omit<LockConfig, "instanceId">): DistributedLock {
  const instanceId = `instance-${process.pid}-${Math.floor(getMonotonicTime())}`;

  return {
    instanceId,

    async acquire(): Promise<boolean> {
      const result = await acquireDistributedLock({ ...config, instanceId });
      return result.success;
    },

    async release(force = false): Promise<void> {
      await releaseDistributedLock({ lockKey: config.lockKey, instanceId, logCategory: config.logCategory }, force);
    },

    async cleanup(): Promise<void> {
      await cleanupStaleLocks(config.lockKey, config.logCategory);
    },
  };
}
