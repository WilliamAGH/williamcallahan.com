/**
 * Type definitions for Next.js 15 experimental cache features
 * These are experimental APIs that may change
 */

declare module 'next/cache' {
  export function unstable_cache<T extends (...args: any[]) => any>(
    fn: T,
    keyParts?: string[],
    options?: {
      revalidate?: number | false;
      tags?: string[];
    }
  ): T;
  
  export function revalidatePath(path: string, type?: 'page' | 'layout'): void;
  export function revalidateTag(tag: string): void;
  export function unstable_noStore(): void;
  
  // In canary versions, these are exported with unstable_ prefix
  export function unstable_cacheLife(profile: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'max' | {
    stale?: number;
    revalidate?: number;
    expire?: number;
  }): void;
  
  export function unstable_cacheTag(...tags: string[]): void;
}

// Global functions available inside 'use cache' functions
declare global {
  /**
   * Sets the cache lifetime for the current cached function.
   * Only available inside functions marked with 'use cache'.
   */
  function cacheLife(profile: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'max'): void;
  
  /**
   * Adds cache tags to the current cached function.
   * Only available inside functions marked with 'use cache'.
   */
  function cacheTag(...tags: string[]): void;
}