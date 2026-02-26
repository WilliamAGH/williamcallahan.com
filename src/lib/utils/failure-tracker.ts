/**
 * Generic Failure Tracker
 *
 * Tracks failed items with configurable retry logic (in-memory only).
 * State resets on process restart; acceptable for transient skip-lists.
 * Used for domains, URLs, or any other items that need retry tracking.
 */

import type { ZodSchema } from "zod/v4";
import { debugLog } from "./debug";
import { getMonotonicTime } from "@/lib/utils";
import type { FailedItem, FailureTrackerConfig } from "@/types/s3-cdn";

/**
 * Generic in-memory failure tracker
 */
export class FailureTracker<T> {
  private failures = new Map<string, FailedItem<T>>();
  private loaded = false;

  private readonly config: Required<FailureTrackerConfig>;

  constructor(
    private getKey: (item: T) => string,
    private itemSchema: ZodSchema<T>,
    config: FailureTrackerConfig,
  ) {
    this.config = {
      storeKey: config.storeKey,
      maxRetries: config.maxRetries ?? 3,
      cooldownMs: config.cooldownMs ?? 24 * 60 * 60 * 1000, // 24 hours
      maxItems: config.maxItems ?? 5000,
      name: config.name ?? "FailureTracker",
    };
  }

  /**
   * Mark the tracker as initialized. Failure state is purely in-memory;
   * it resets on process restart, which is acceptable for transient skip-lists.
   */
  async load(): Promise<void> {
    this.loaded = true;
  }

  /**
   * No-op — failure state is kept in-memory only.
   */
  async save(): Promise<void> {
    // In-memory only; nothing to persist.
  }

  /**
   * Check if item should be skipped
   */
  async shouldSkip(item: T): Promise<boolean> {
    await this.load();

    const key = this.getKey(item);
    const failure = this.failures.get(key);

    if (!failure) return false;

    // Skip permanently failed items
    if (failure.permanentFailure) return true;

    // Skip if still in cooldown
    if (failure.attempts >= this.config.maxRetries) {
      const timeSinceLastAttempt = getMonotonicTime() - failure.lastAttempt;
      return timeSinceLastAttempt < this.config.cooldownMs;
    }

    return false;
  }

  /**
   * Record a failure
   */
  async recordFailure(item: T, reason?: string): Promise<void> {
    await this.load();

    // Enforce size limit
    if (this.failures.size >= this.config.maxItems) {
      this.pruneOldest();
    }

    const key = this.getKey(item);
    const existing = this.failures.get(key);

    const failure: FailedItem<T> = existing
      ? {
          ...existing,
          attempts: existing.attempts + 1,
          lastAttempt: getMonotonicTime(),
          reason: reason || existing.reason,
        }
      : {
          item,
          attempts: 1,
          lastAttempt: getMonotonicTime(),
          reason,
        };

    // Mark as permanent failure after too many attempts
    if (failure.attempts >= this.config.maxRetries * 2) {
      failure.permanentFailure = true;
    }

    this.failures.set(key, failure);

    // Save periodically (every 10 failures)
    if (this.failures.size % 10 === 0) {
      await this.save();
    }
  }

  /**
   * Remove an item from failures (e.g., after successful retry)
   */
  removeFailure(item: T): void {
    const key = this.getKey(item);
    this.failures.delete(key);
  }

  /**
   * Get failure statistics
   */
  getStats() {
    const permanent = Array.from(this.failures.values()).filter((f) => f.permanentFailure).length;
    const temporary = this.failures.size - permanent;

    return {
      total: this.failures.size,
      permanent,
      temporary,
      maxItems: this.config.maxItems,
    };
  }

  /**
   * Clear all failures
   */
  clear(): void {
    this.failures.clear();
  }

  /**
   * Prune oldest entries when limit reached
   */
  private pruneOldest(): void {
    const toRemove = Math.floor(this.config.maxItems * 0.2); // Remove 20%
    const sorted = Array.from(this.failures.entries()).toSorted(
      ([, a], [, b]) => a.lastAttempt - b.lastAttempt,
    );

    for (let i = 0; i < toRemove && i < sorted.length; i++) {
      const entry = sorted[i];
      if (entry) {
        const [key] = entry;
        this.failures.delete(key);
      }
    }

    debugLog(`[${this.config.name}] Pruned ${toRemove} oldest entries`, "warn");
  }
}
