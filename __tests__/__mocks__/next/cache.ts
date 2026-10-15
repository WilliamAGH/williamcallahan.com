/**
 * Mock for next/cache module
 */
import { vi, type Mock } from "vitest";
import type * as NextCache from "next/cache";

interface CacheOptions {
  revalidate?: number;
  tags?: string[];
}

type CachedCallback = (...args: unknown[]) => Promise<unknown>;
type CachedFunctionMock = Mock<CachedCallback> & CacheOptions;
type UnstableCacheMock = (
  fn: CachedCallback,
  _keyParts?: string[],
  options?: CacheOptions,
) => CachedFunctionMock;

// Mock functions for caching
export const unstable_cacheLife = vi.fn<typeof NextCache.cacheLife>();
export const unstable_cacheTag = vi.fn<typeof NextCache.cacheTag>();
export const revalidateTag = vi.fn<typeof NextCache.revalidateTag>();
export const revalidatePath = vi.fn<typeof NextCache.revalidatePath>();

// Mock unstable_cache to match Next.js 15+ behavior - returns a wrapped async function
export const unstable_cache = vi.fn<UnstableCacheMock>((fn, _keyParts, options) => {
  // Create a wrapped function that matches Next.js's behavior
  const wrappedFn: CachedFunctionMock = vi.fn<CachedCallback>(async (...args) => fn(...args));

  // Add properties that Next.js might add to the wrapped function
  if (options) {
    wrappedFn.revalidate = options.revalidate;
    wrappedFn.tags = options.tags;
  }

  return wrappedFn;
});

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
