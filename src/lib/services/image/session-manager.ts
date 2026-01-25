/**
 * Domain tracking, memory cleanup, and request deduplication
 * @module lib/services/image/session-manager
 */

import { getDeterministicTimestamp } from "@/lib/server-cache";
import { UNIFIED_IMAGE_SERVICE_CONFIG, LOGO_BLOCKLIST_S3_PATH } from "@/lib/constants";
import { FailureTracker } from "@/lib/utils/failure-tracker";
import { getMemoryHealthMonitor } from "@/lib/health/memory-health-monitor";
import { isOperationAllowedWithCircuitBreaker, recordOperationFailure } from "@/lib/rate-limiter";
import logger from "@/lib/utils/logger";
import { getErrorMessage } from "@/types/error";

import type { LogoFetchResult } from "@/types/cache";

const CONFIG = UNIFIED_IMAGE_SERVICE_CONFIG;

/**
 * Session and domain failure tracking manager
 */
export class SessionManager {
  private cleanupTimerId: NodeJS.Timeout | null = null;
  private sessionFailedDomains = new Set<string>();
  private domainRetryCount = new Map<string, number>();
  private domainFirstFailureTime = new Map<string, number>();
  private sessionStartTime = getDeterministicTimestamp();
  private lastCleanupTime = getDeterministicTimestamp();

  // Request deduplication for concurrent logo fetches
  private inFlightLogoRequests = new Map<string, Promise<LogoFetchResult>>();

  // Use FailureTracker for domain blocklist management
  readonly domainFailureTracker = new FailureTracker<string>(domain => domain, {
    s3Path: LOGO_BLOCKLIST_S3_PATH,
    maxRetries: CONFIG.PERMANENT_FAILURE_THRESHOLD,
    cooldownMs: 24 * 60 * 60 * 1000, // 24 hours
    maxItems: CONFIG.MAX_BLOCKLIST_SIZE,
    name: "SessionManager-DomainTracker",
  });

  private readonly devStreamImagesToS3: boolean;

  constructor(devStreamImagesToS3: boolean) {
    this.devStreamImagesToS3 = devStreamImagesToS3;
    this.startPeriodicCleanup();
    void this.domainFailureTracker.load();
  }

  /**
   * Check if service should accept new requests based on memory health
   * In dev streaming mode, always allow requests (streaming uses bounded memory)
   */
  shouldAcceptRequests(): boolean {
    if (this.devStreamImagesToS3) return true;
    return getMemoryHealthMonitor().shouldAcceptNewRequests();
  }

  /**
   * Check if domain has failed too many times in current session
   */
  hasDomainFailedTooManyTimes(domain: string): boolean {
    this.checkAndResetSession();

    return !isOperationAllowedWithCircuitBreaker(
      "domain-failures",
      domain,
      { maxRequests: CONFIG.MAX_RETRIES_PER_SESSION, windowMs: CONFIG.SESSION_MAX_DURATION },
      { failureThreshold: CONFIG.PERMANENT_FAILURE_THRESHOLD, resetTimeout: CONFIG.SESSION_MAX_DURATION },
    );
  }

  /**
   * Mark domain as failed
   */
  markDomainAsFailed(domain: string): void {
    if (this.sessionFailedDomains.size >= CONFIG.MAX_SESSION_DOMAINS) {
      logger.info(`[SessionManager] Session domain limit reached (${CONFIG.MAX_SESSION_DOMAINS}), resetting session`);
      this.resetDomainSessionTracking();
    }

    this.sessionFailedDomains.add(domain);
    recordOperationFailure("domain-failures", domain, {
      failureThreshold: CONFIG.PERMANENT_FAILURE_THRESHOLD,
      resetTimeout: CONFIG.SESSION_MAX_DURATION,
    });
    const currentCount = (this.domainRetryCount.get(domain) || 0) + 1;
    this.domainRetryCount.set(domain, currentCount);

    if (currentCount >= CONFIG.PERMANENT_FAILURE_THRESHOLD) {
      logger.info(`[SessionManager] Domain ${domain} has failed ${currentCount} times, adding to permanent blocklist`);
      void this.domainFailureTracker.recordFailure(domain, `Failed ${currentCount} times across sessions`);
    }
  }

  /**
   * Check if domain should be skipped (blocked or in cooldown)
   */
  async shouldSkipDomain(domain: string): Promise<boolean> {
    return this.domainFailureTracker.shouldSkip(domain);
  }

  /**
   * Remove domain from failure tracker (on success)
   */
  removeDomainFailure(domain: string): void {
    this.domainFailureTracker.removeFailure(domain);
  }

  /**
   * Save failure tracker state
   */
  async saveFailureTracker(): Promise<void> {
    await this.domainFailureTracker.save();
  }

  /**
   * Get existing in-flight request for domain
   */
  getInFlightRequest(domain: string): Promise<LogoFetchResult> | undefined {
    return this.inFlightLogoRequests.get(domain);
  }

  /**
   * Set in-flight request for domain with automatic cleanup
   */
  setInFlightRequest(domain: string, promise: Promise<LogoFetchResult>): void {
    // Enforce limit on concurrent requests
    if (this.inFlightLogoRequests.size >= CONFIG.MAX_IN_FLIGHT_REQUESTS) {
      const firstKey = this.inFlightLogoRequests.keys().next().value;
      if (firstKey) this.inFlightLogoRequests.delete(firstKey);
    }
    this.inFlightLogoRequests.set(domain, promise);

    // Clean up after completion (success or failure)
    // Capture the promise reference for identity check to avoid removing newer requests
    const capturedPromise = promise;
    promise
      .finally(() =>
        setTimeout(() => {
          // Only delete if the current entry is still the same promise (identity check)
          if (this.inFlightLogoRequests.get(domain) === capturedPromise) {
            this.inFlightLogoRequests.delete(domain);
          }
        }, 100),
      )
      .catch((error: unknown) => {
        const message = getErrorMessage(error);
        logger.debug("[SessionManager] In-flight request cleanup error", { domain, message });
      });
  }

  /**
   * Check session age and reset if needed
   */
  private checkAndResetSession(): void {
    if (getDeterministicTimestamp() - this.sessionStartTime > CONFIG.SESSION_MAX_DURATION) {
      this.resetDomainSessionTracking();
    }
  }

  /**
   * Reset all domain session tracking
   */
  private resetDomainSessionTracking(): void {
    this.sessionFailedDomains.clear();
    this.domainRetryCount.clear();
    this.domainFirstFailureTime.clear();
    this.sessionStartTime = getDeterministicTimestamp();
  }

  /**
   * Start periodic memory cleanup
   */
  private startPeriodicCleanup(): void {
    if (this.cleanupTimerId) return; // Already running
    this.cleanupTimerId = setInterval(() => this.performMemoryCleanup(), CONFIG.CLEANUP_INTERVAL);
    if (process.env.NODE_ENV !== "test") process.on("beforeExit", () => this.stopPeriodicCleanup());
  }

  /**
   * Stop periodic memory cleanup
   */
  stopPeriodicCleanup(): void {
    if (this.cleanupTimerId) {
      clearInterval(this.cleanupTimerId);
      this.cleanupTimerId = null;
    }
  }

  /**
   * Perform memory cleanup of tracking structures
   */
  performMemoryCleanup(): void {
    const now = getDeterministicTimestamp();

    if (this.inFlightLogoRequests.size > CONFIG.MAX_IN_FLIGHT_REQUESTS) {
      const entries = Array.from(this.inFlightLogoRequests.entries());
      const toKeep = entries.slice(-Math.floor(CONFIG.MAX_IN_FLIGHT_REQUESTS / 2));
      this.inFlightLogoRequests.clear();
      toKeep.forEach(([k, v]) => this.inFlightLogoRequests.set(k, v));
      logger.warn(`[SessionManager] Reduced in-flight requests from ${entries.length} to ${toKeep.length}`);
    }

    if (now - this.lastCleanupTime > CONFIG.CLEANUP_INTERVAL) {
      if (this.sessionFailedDomains.size > CONFIG.MAX_SESSION_DOMAINS) {
        this.sessionFailedDomains.clear();
      }

      if (this.domainRetryCount.size > CONFIG.MAX_SESSION_DOMAINS) {
        const entries = Array.from(this.domainRetryCount.entries());
        this.domainRetryCount.clear();
        const recentEntries = entries.slice(-Math.floor(CONFIG.MAX_SESSION_DOMAINS / 2));
        recentEntries.forEach(([k, v]) => this.domainRetryCount.set(k, v));
        const retryDomains = new Set(recentEntries.map(([k]) => k));
        for (const domain of this.domainFirstFailureTime.keys()) {
          if (!retryDomains.has(domain)) this.domainFirstFailureTime.delete(domain);
        }
      }

      this.lastCleanupTime = now;
      if (global.gc) {
        global.gc();
        logger.info("[SessionManager] Forced garbage collection after cleanup");
      }
    }
  }
}
