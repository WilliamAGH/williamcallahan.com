/**
 * Development Cache Controller
 * @module lib/devCache
 * @description
 * Controls cache behavior in development environment.
 * Automatically clears caches when files change.
 *
 * @see {@link lib/cache.ts} - Main cache implementation
 * @see {@link lib/serverCache.ts} - Server cache implementation
 * @see {@link lib/constants.ts} - Cache duration settings
 *
 * Development Features:
 * - Auto-clears on file changes
 * - Shorter TTL (1 minute vs 30 days)
 * - More frequent checks (30s vs 24h)
 * - Activates when NEXT_PUBLIC_SITE_URL !== 'https://williamcallahan.com'
 */

import { cache } from './cache';
import { ServerCacheInstance } from './serverCache';

/**
 * Determines if the application is running in a development environment
 * @returns {boolean} True if not running on production domain
 */
export const isDevEnvironment = () => {
  return process.env.NEXT_PUBLIC_SITE_URL !== 'https://williamcallahan.com';
};

/**
 * Cache configuration based on environment
 */
export const cacheConfig = {
  ttl: isDevEnvironment() ? 60 : 30 * 24 * 60 * 60, // 1 min in dev, 30 days in prod
  checkPeriod: isDevEnvironment() ? 30 : 24 * 60 * 60 // 30s in dev, 24h in prod
};

// Set up development mode cache clearing
if (isDevEnvironment()) {
  // Type assertion for webpack hot module replacement
  const mod = module as { hot?: { dispose: (callback: () => void) => void } };

  if (mod.hot) {
    mod.hot.dispose(() => {
      // Clear all caches when any file changes in development
      cache.flushAll();
      ServerCacheInstance.clearAllCaches();
      console.log('[Dev Cache] Cleared all caches due to file change');
    });
  }
}

export { cache, ServerCacheInstance };
