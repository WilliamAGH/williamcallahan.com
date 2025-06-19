/**
 * @file Revalidation Utility
 * @description Provides a wrapper for Next.js path revalidation.
 */

import { revalidatePath as nextRevalidatePath } from "next/cache";

/**
 * Revalidates a specified path in the Next.js cache.
 *
 * NOTE: Next.js's revalidatePath is currently synchronous, but this wrapper
 * maintains the same interface for consistency. If Next.js changes to async
 * in the future, callers won't need to be updated.
 *
 * @param path - The path to revalidate (e.g., '/blog/my-post')
 * @param type - The type of revalidation ('page' or 'layout')
 */
export function revalidatePath(path: string, type: "page" | "layout" = "page"): void {
  try {
    nextRevalidatePath(path, type);
  } catch (error) {
    console.error(`Failed to revalidate path: ${path}`, error);
    // Re-throw to allow upstream error handling
    throw error;
  }
}
