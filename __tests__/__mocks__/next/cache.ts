/**
 * Mock for next/cache module
 */
import { vi } from "vitest";

interface CacheOptions {
  revalidate?: number;
  tags?: string[];
}

// Mock functions for caching
export const unstable_cacheLife = vi.fn();
export const unstable_cacheTag = vi.fn();
export const revalidateTag = vi.fn();
export const revalidatePath = vi.fn();

// Mock unstable_cache to match Next.js 15+ behavior - returns a wrapped async function
export const unstable_cache = vi.fn(
  <T extends (...args: unknown[]) => Promise<unknown>>(
    fn: T,
    _keyParts?: string[],
    options?: CacheOptions,
  ) => {
    // Create a wrapped function that matches Next.js's behavior
    const wrappedFn = vi.fn(async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
      // Call the original function
      return (await fn(...args)) as Awaited<ReturnType<T>>;
    }) as ReturnType<typeof vi.fn> & { revalidate?: number; tags?: string[] };

    // Add properties that Next.js might add to the wrapped function
    if (options) {
      wrappedFn.revalidate = options.revalidate;
      wrappedFn.tags = options.tags;
    }

    return wrappedFn;
  },
);

// Mock the cache function (alias for unstable_cache)
export const cache = unstable_cache;

// Aliases for simpler names (these are what the app code imports as)
export const cacheLife = unstable_cacheLife;
export const cacheTag = unstable_cacheTag;

// Default export for compatibility
export default {
  unstable_cacheLife,
  unstable_cacheTag,
  revalidateTag,
  revalidatePath,
  unstable_cache,
  cacheLife,
  cacheTag,
  cache,
};
