/**
 * Mock for next/cache module
 */

// Mock functions for caching
const unstableCacheLife = jest.fn();
const unstableCacheTag = jest.fn();
const revalidateTag = jest.fn();
const revalidatePath = jest.fn();

// Mock unstable_cache to match Next.js 15 behavior - returns a wrapped async function
const unstableCache = jest.fn((fn, keyParts, options) => {
  void keyParts; // Explicitly mark as intentionally unused
  // Create a wrapped function that matches Next.js 15's behavior
  const wrappedFn = jest.fn(async (...args) => {
    // Call the original function
    return await fn(...args);
  });

  // Add properties that Next.js might add to the wrapped function
  if (options) {
    wrappedFn.revalidate = options.revalidate;
    wrappedFn.tags = options.tags;
  }

  return wrappedFn;
});

// Mock the cache function (alias for unstable_cache)
const cache = unstableCache;

// Mock React's cache function if it's being used
if (typeof jest !== "undefined") {
  jest.mock("react", () => ({
    ...jest.requireActual("react"),
    cache: jest.fn(fn => fn), // Pass-through for tests
  }));
}

module.exports = {
  unstable_cacheLife: unstableCacheLife,
  unstable_cacheTag: unstableCacheTag,
  revalidateTag,
  revalidatePath,
  unstable_cache: unstableCache,
  // Aliases for simpler names (these are what the app code imports as)
  cacheLife: unstableCacheLife,
  cacheTag: unstableCacheTag,
  cache,
  // Export both ways for compatibility
  default: {
    unstable_cacheLife: unstableCacheLife,
    unstable_cacheTag: unstableCacheTag,
    revalidateTag,
    revalidatePath,
    unstable_cache: unstableCache,
    cacheLife: unstableCacheLife,
    cacheTag: unstableCacheTag,
    cache,
  },
};
