/**
 * Bookmarks Preloader
 * -------------------
 * Runs in the Node runtime only.  Provides:
 *   • preloadBookmarksIfNeeded – idempotent single-run fetch with timeout guard
 *   • scheduleBackgroundBookmarkPreload – kicks off preload after an initial delay
 *     and keeps data warm on a regular interval.
 */

import * as Sentry from "@sentry/nextjs";

// Flags to prevent redundant work across calls within the same process
let isPreloading = false;
let hasPreloaded = false;
let preloadPromise: Promise<void> | null = null;

/**
 * Fetch external bookmarks once, caching results in memory-only for the
 * lifetime of the server process.  Safe to call multiple times.
 */
export async function preloadBookmarksIfNeeded(): Promise<void> {
  if (isPreloading && preloadPromise) return preloadPromise;
  if (hasPreloaded) return Promise.resolve();

  isPreloading = true;

  preloadPromise = (async () => {
    try {
      // Ensure the server is fully ready before we spike outbound bandwidth
      await new Promise((r) => setTimeout(r, 1_000));

      // Dynamic import avoids pulling client-only deps into the Edge bundle
      const { fetchExternalBookmarks } = await import("../bookmarks.client");
       
      console.log("Preloading bookmarks into server cache...");

      // Guard against hangs
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Preload timeout after 30 seconds")), 30_000);
      });

      await Promise.race([fetchExternalBookmarks(), timeoutPromise]);
       
      console.log("Bookmarks preloaded successfully");
    } catch (err) {
      Sentry.captureException(err);
       
      console.error("Failed to preload bookmarks:", err);
    } finally {
      hasPreloaded = true;
      isPreloading = false;
      preloadPromise = null;
    }
  })();

  return preloadPromise;
}

/**
 * Schedule bookmark warm-up in the background.
 *
 * Env vars (optional):
 *   BOOKMARKS_PRELOAD_DELAY_MS     – delay before first preload (default 5s)
 *   BOOKMARKS_PRELOAD_INTERVAL_MS  – repeat interval (default 2h)
 */
export function scheduleBackgroundBookmarkPreload(): void {
  // Only run in a long-lived Node process.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const initialDelayMs = Number(process.env.BOOKMARKS_PRELOAD_DELAY_MS ?? "5000");
  const intervalMs = Number(process.env.BOOKMARKS_PRELOAD_INTERVAL_MS ?? "7200000");

  setTimeout(() => {
    void preloadBookmarksIfNeeded();

    // Keep data warm.
    setInterval(() => {
      void preloadBookmarksIfNeeded();
    }, intervalMs)
      // Allow Node to exit gracefully if nothing else is keeping it alive
      .unref();
  }, initialDelayMs).unref();
} 