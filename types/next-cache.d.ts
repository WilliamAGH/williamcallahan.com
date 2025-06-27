/**
 * Type definitions for Next.js 15 experimental cache features
 * These are experimental APIs that may change
 *
 * Based on Next.js 15 canary documentation:
 * - https://nextjs.org/docs/canary/app/api-reference/directives/use-cache
 * - https://nextjs.org/docs/canary/app/api-reference/functions/cacheLife
 * - https://nextjs.org/docs/canary/app/api-reference/functions/cacheTag
 */

/* eslint-disable @typescript-eslint/naming-convention */
// Disabling naming convention for this file as it contains official Next.js API function names
// that use unstable_ prefix and cannot be changed
declare module "next/cache" {
  // Standard cache functions that have been stable
  export function revalidatePath(path: string, type?: "page" | "layout"): void;
  export function revalidateTag(tag: string): void;

  // Legacy unstable_cache function
  export function unstable_cache<T extends (...args: unknown[]) => unknown>(
    fn: T,
    keyParts?: string[],
    options?: {
      revalidate?: number | false;
      tags?: string[];
    },
  ): T;

  export function unstable_noStore(): void;

  // Next.js 15 'use cache' related functions
  // These are imported and used inside 'use cache' functions

  /**
   * Cache lifetime configuration for 'use cache' functions.
   * Import as: import { unstable_cacheLife as cacheLife } from 'next/cache'
   * Use inside functions marked with 'use cache'.
   */
  export function unstable_cacheLife(
    profile:
      | "default"
      | "seconds"
      | "minutes"
      | "hours"
      | "days"
      | "weeks"
      | "max"
      | {
          stale?: number;
          revalidate?: number;
          expire?: number;
        },
  ): void;

  /**
   * Cache tagging for 'use cache' functions.
   * Import as: import { unstable_cacheTag as cacheTag } from 'next/cache'
   * Use inside functions marked with 'use cache'.
   */
  export function unstable_cacheTag(...tags: string[]): void;
}

// Type augmentation for 'use cache' directive
// Note: The 'use cache' directive is a string literal that doesn't need explicit typing
// TypeScript will handle it as a directive when used at the top of functions/components
