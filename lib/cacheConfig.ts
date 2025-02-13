/**
 * Cache Configuration
 * @module lib/cacheConfig
 * @description
 * Central configuration for all cache behavior.
 * Controls environment detection and cache settings.
 *
 * @see {@link lib/cache.ts} - Main cache implementation
 * @see {@link lib/serverCache.ts} - Server cache implementation
 *
 * Environment Detection:
 * - Production: NEXT_PUBLIC_SITE_URL === 'https://williamcallahan.com'
 * - Development: Any other NEXT_PUBLIC_SITE_URL value
 *   - 1-minute cache duration
 *   - Auto-clear on file changes
 *   - 30-second check period
 */

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

/**
 * Hot Module Replacement handler for development
 * @param {() => void} clearCallback - Function to clear caches
 */
export const setupHotReload = (clearCallback: () => void) => {
  if (isDevEnvironment()) {
    // Type assertion for webpack hot module replacement
    const mod = module as { hot?: { dispose: (callback: () => void) => void } };

    if (mod.hot) {
      mod.hot.dispose(() => {
        clearCallback();
        console.log('[Dev Cache] Cleared all caches due to file change');
      });
    }
  }
};
