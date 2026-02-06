/**
 * Middleware Types
 *
 * Shared type contracts for proxy/middleware helpers.
 *
 * @module types/middleware
 */

export type MemoryPressureLevel = "CRITICAL" | "WARNING";

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

export type RateLimitProfileName = "page" | "api" | "sentryTunnel";

export type ProxyRequestClass = "document" | "rsc" | "prefetch" | "api" | "image" | "other";

/**
 * Options are intended for tests only.
 * Production code should not set store prefixes.
 */
export interface SitewideRateLimitOptions {
  storePrefix?: string;
}
