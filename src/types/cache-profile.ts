/**
 * Next.js 15 'use cache' profile types
 * Used for migration to Next.js 15 caching
 *
 * Separated from types/cache.ts to avoid circular dependencies
 */
export type CacheDurationProfile =
  | "default"
  | "seconds"
  | "minutes"
  | "hours"
  | "days"
  | "weeks"
  | "max"
  | { stale?: number; revalidate?: number; expire?: number };
