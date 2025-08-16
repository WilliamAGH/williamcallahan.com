/**
 * Generic Failure Tracker
 *
 * Tracks failed items with configurable retry logic and S3 persistence
 * Used for domains, URLs, or any other items that need retry tracking
 */

import { readJsonS3, writeJsonS3 } from "@/lib/s3-utils";
import { debugLog } from "./debug";
import type { FailedItem, FailureTrackerConfig } from "@/types/s3-cdn";

/**
 * Generic failure tracker with S3 persistence
 */
export class FailureTracker<T> {
  private failures = new Map<string, FailedItem<T>>();
  private loaded = false;

  private readonly config: Required<FailureTrackerConfig>;

  constructor(
    private getKey: (item: T) => string,
    config: FailureTrackerConfig,
  ) {
    this.config = {
      s3Path: config.s3Path,
      maxRetries: config.maxRetries ?? 3,
      cooldownMs: config.cooldownMs ?? 24 * 60 * 60 * 1000, // 24 hours
      maxItems: config.maxItems ?? 5000,
      name: config.name ?? "FailureTracker",
    };
  }

  /**
   * Load failures from S3
   */
  async load(): Promise<void> {
    if (this.loaded) return;

    try {
      const data = await readJsonS3<Record<string, FailedItem<T>>>(this.config.s3Path);
      if (data && typeof data === "object") {
        this.failures.clear();
        Object.entries(data).forEach(([key, item]) => {
          this.failures.set(key, item);
        });
        debugLog(`[${this.config.name}] Loaded ${this.failures.size} failed items`);
      }
    } catch {
      // File doesn't exist yet, that's fine
    }

    this.loaded = true;
  }

  /**
   * Save failures to S3
   */
  async save(): Promise<void> {
    try {
      const data: Record<string, FailedItem<T>> = {};
      this.failures.forEach((item, key) => {
        data[key] = item;
      });
      await writeJsonS3(this.config.s3Path, data);
      debugLog(`[${this.config.name}] Saved ${this.failures.size} failed items`);
    } catch (error) {
      debugLog(`[${this.config.name}] Failed to save`, "error", { error });
    }
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
      const timeSinceLastAttempt = Date.now() - failure.lastAttempt;
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
          lastAttempt: Date.now(),
          reason: reason || existing.reason,
        }
      : {
          item,
          attempts: 1,
          lastAttempt: Date.now(),
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
    const sorted = Array.from(this.failures.entries()).sort(([, a], [, b]) => a.lastAttempt - b.lastAttempt);

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
