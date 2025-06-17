/**
 * @file Revalidation Utility
 * @description Provides a wrapper for Next.js path revalidation.
 */

import { revalidatePath as nextRevalidatePath } from "next/cache";

/**
 * Revalidates a specified path in the Next.js cache.
 *
 * @param path - The path to revalidate (e.g., '/blog/my-post')
 * @param type - The type of revalidation ('page' or 'layout')
 */
export function revalidatePath(path: string, type: "page" | "layout" = "page"): void {
  try {
    nextRevalidatePath(path, type);
  } catch (error) {
    console.error(`Failed to revalidate path: ${path}`, error);
  }
}
