/**
 * Next.js 15 'use cache' profile types
 * Used for migration to Next.js 15 caching
 * 
 * Separated from types/cache.ts to avoid circular dependencies
 */
export type CacheProfile = 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'max';