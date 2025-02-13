/**
 * Cache Management
 * @module lib/cache
 * @description
 * Provides application-wide caching functionality.
 *
 * @see {@link lib/cacheConfig.ts} - For environment detection and cache settings
 * @see {@link lib/constants.ts} - For cache duration constants
 * @see {@link lib/serverCache.ts} - For server-side caching implementation
 *
 * Cache Settings:
 * - Production: 30-day TTL, 24h check period
 * - Development: 1-minute TTL, 30s check period, auto-clear on changes
 *
 * Configuration:
 * - Environment detection in lib/cacheConfig.ts
 * - Cache durations in lib/constants.ts
 * - Development behavior in lib/cacheConfig.ts
 */

import NodeCache from 'node-cache';
import { cacheConfig, setupHotReload } from './cacheConfig';

// Create a cache instance with environment-aware configuration
const cache = new NodeCache({
  stdTTL: cacheConfig.ttl,
  checkperiod: cacheConfig.checkPeriod,
  useClones: false
});

// Set up hot reload cache clearing in development
setupHotReload(() => cache.flushAll());

export { cache };
