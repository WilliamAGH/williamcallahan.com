/**
 * Session Management for Logo Processing
 *
 * @module data-access/logos/session
 */

import { SESSION_MAX_DURATION, MAX_RETRIES_PER_SESSION } from './config';
import { isDebug } from '@/lib/utils/debug';
import { invalidateS3LogoKeysCache } from './s3-cache';

// Session-based tracking to prevent infinite loops
const SESSION_PROCESSED_DOMAINS = new Set<string>();
const SESSION_FAILED_DOMAINS = new Set<string>();
let SESSION_START_TIME = Date.now();
const DOMAIN_RETRY_COUNT = new Map<string, number>();

/**
 * Checks if the session has expired and resets it if necessary.
 */
export function checkAndResetSession(): void {
  const currentTime: number = Date.now();
  if (currentTime - SESSION_START_TIME > SESSION_MAX_DURATION) {
    if (isDebug) console.log('[DataAccess/Logos] Session expired, resetting tracking.');
    resetLogoSessionTracking();
  }
}

/**
 * Checks if a domain has already been processed in the current session.
 * @param domain The domain to check.
 * @returns True if the domain has been processed, false otherwise.
 */
export function isDomainProcessed(domain: string): boolean {
  return SESSION_PROCESSED_DOMAINS.has(domain);
}

/**
 * Marks a domain as processed in the current session.
 * @param domain The domain to mark as processed.
 */
export function markDomainAsProcessed(domain: string): void {
  SESSION_PROCESSED_DOMAINS.add(domain);
}

/**
 * Checks if a domain has failed processing too many times in the current session.
 * @param domain The domain to check.
 * @returns True if the domain has failed too many times, false otherwise.
 */
export function hasDomainFailedTooManyTimes(domain: string): boolean {
  const retryCount: number = DOMAIN_RETRY_COUNT.get(domain) || 0;
  return retryCount >= MAX_RETRIES_PER_SESSION;
}

/**
 * Marks a domain as failed in the current session.
 * @param domain The domain to mark as failed.
 */
export function markDomainAsFailed(domain: string): void {
  SESSION_FAILED_DOMAINS.add(domain);
}

/**
 * Increments the retry count for a domain.
 * @param domain The domain to increment the retry count for.
 */
export function incrementDomainRetryCount(domain: string): void {
  const currentRetries: number = DOMAIN_RETRY_COUNT.get(domain) || 0;
  DOMAIN_RETRY_COUNT.set(domain, currentRetries + 1);
}

/**
 * Resets the session tracking state to prevent infinite loops.
 * Useful for clearing state between different processing contexts.
 */
export function resetLogoSessionTracking(): void {
  SESSION_PROCESSED_DOMAINS.clear();
  SESSION_FAILED_DOMAINS.clear();
  DOMAIN_RETRY_COUNT.clear();
  SESSION_START_TIME = Date.now();
  invalidateS3LogoKeysCache();
  console.log('[DataAccess/Logos] Session tracking reset and S3 cache invalidated.');
}

/**
 * Gets current session tracking statistics for debugging.
 */
export function getLogoSessionStats(): {
  processedCount: number;
  failedCount: number;
  sessionAge: number;
} {
  return {
    processedCount: SESSION_PROCESSED_DOMAINS.size,
    failedCount: SESSION_FAILED_DOMAINS.size,
    sessionAge: Date.now() - SESSION_START_TIME,
  };
}
