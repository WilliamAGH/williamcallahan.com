/**
 * Middleware Types
 *
 * Shared type contracts for proxy/middleware helpers.
 *
 * @module types/middleware
 */

export interface MemoryPressureStatus {
  critical: boolean;
  warning: boolean;
}

/**
 * Overrides are intended for tests only.
 * Production code should not provide these values.
 */
export interface MemoryPressureOverrides {
  rssBytes?: number;
  limitBytes?: number;
}

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export interface RateLimitProfile {
  burst: RateLimitConfig;
  minute: RateLimitConfig;
}

/**
 * Options are intended for tests only.
 * Production code should not set store prefixes.
 */
export interface SitewideRateLimitOptions {
  storePrefix?: string;
}
