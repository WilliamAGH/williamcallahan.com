import NodeCache from 'node-cache';

// Create a cache instance with 30-day TTL
const cache = new NodeCache({
  stdTTL: 30 * 24 * 60 * 60, // 30 days in seconds
  checkperiod: 24 * 60 * 60, // Check for expired keys every day
  useClones: false
});

export { cache };
