import NodeCache from 'node-cache';

// Create a cache instance with configurable TTL
const cache = new NodeCache({
  stdTTL: 30 * 24 * 60 * 60, // Default: 30 days in seconds
  checkperiod: 24 * 60 * 60, // Check for expired keys every day
  useClones: false
});

// Cache TTL constants (in seconds)
export const CACHE_TTL = {
  DEFAULT: 30 * 24 * 60 * 60, // 30 days
  DAILY: 24 * 60 * 60,        // 24 hours
  HOURLY: 60 * 60             // 1 hour
};

export { cache };
