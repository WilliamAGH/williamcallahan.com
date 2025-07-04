/**
 * Simple async lock implementation for concurrency control
 * @module lib/utils/async-lock
 */

import { debug, debugWarn } from "./debug";

/**
 * Async lock for preventing concurrent access to critical sections
 */
export class AsyncLock {
  private locks = new Map<string, Promise<void>>();
  private readonly name: string;
  private readonly timeout: number;

  constructor(name = "AsyncLock", timeout = 30000) {
    this.name = name;
    this.timeout = timeout;
  }

  /**
   * Acquire a lock for the given key
   * @param key - Lock identifier
   * @param fn - Function to execute while holding the lock
   * @returns Result of the function
   */
  async acquire<T>(key: string, fn: () => Promise<T>): Promise<T> {
    // Wait for any existing lock
    const existingLock = this.locks.get(key);
    if (existingLock) {
      debug(`[${this.name}] Waiting for lock on ${key}`);
      try {
        await existingLock;
      } catch {
        // Previous lock failed, we can proceed
      }
    }

    // Create new lock
    let releaseLock: (() => void) | undefined;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    // Set up timeout
    const timeoutId = setTimeout(() => {
      debugWarn(`[${this.name}] Lock timeout for ${key} after ${this.timeout}ms`);
      releaseLock?.();
      this.locks.delete(key);
    }, this.timeout);

    this.locks.set(key, lockPromise);

    try {
      debug(`[${this.name}] Lock acquired for ${key}`);
      const result = await fn();
      return result;
    } finally {
      clearTimeout(timeoutId);
      releaseLock?.();
      this.locks.delete(key);
      debug(`[${this.name}] Lock released for ${key}`);
    }
  }

  /**
   * Check if a lock is currently held
   */
  isLocked(key: string): boolean {
    return this.locks.has(key);
  }

  /**
   * Get number of active locks
   */
  get size(): number {
    return this.locks.size;
  }

  /**
   * Clear all locks (use with caution)
   */
  clear(): void {
    debugWarn(`[${this.name}] Clearing all ${this.locks.size} locks`);
    this.locks.clear();
  }
}

/**
 * Global lock instances for different purposes
 */
export const s3WriteLock = new AsyncLock("S3WriteLock");
export const migrationLock = new AsyncLock("MigrationLock", 60000); // 1 minute timeout