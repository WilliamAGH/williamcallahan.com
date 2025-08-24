/**
 * Bookmarks Preloader
 * -------------------
 * Runs in the Node runtime only.  Provides:
 *   • preloadBookmarksIfNeeded – idempotent single-run fetch with timeout guard
 *   • scheduleBackgroundBookmarkPreload – kicks off preload after an initial delay
 *     and keeps data warm on a regular interval.
 */

import * as Sentry from "@sentry/nextjs";
import { monitoredAsync } from "../async-operations-monitor";
import { DEFAULT_BOOKMARK_OPTIONS } from "@/lib/constants";

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
      await new Promise(r => setTimeout(r, 1_000));

      // Dynamic import to use the unified service
      const { getBookmarks } = await import("./service.server");

      console.log("Preloading bookmarks into server cache...");

      // Determine whether to hit external APIs based on the operator override.
      // External OpenGraph fetches can easily allocate >300 MB in aggregate.
      const skipExternalFetch: boolean = process.env.BOOKMARKS_SKIP_EXTERNAL_FETCH === "true";

      await monitoredAsync(
        null, // Let monitor generate ID
        "Bookmark Preload",
        async () => {
          const result = await getBookmarks({
            ...DEFAULT_BOOKMARK_OPTIONS,
            includeImageData: true,
            skipExternalFetch,
            force: false,
          });
          console.log("Bookmarks preloaded successfully");
          return result;
        },
        {
          timeoutMs: 30000,
          metadata: { source: "instrumentation", production: true },
        },
      );
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

// Store interval reference for cleanup
let preloadIntervalId: NodeJS.Timeout | null = null;

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

  // Skip during build phase to prevent blocking I/O
  if (process.env.NEXT_PHASE === "phase-production-build") {
    console.log("[Bookmarks Preloader] Build phase detected - skipping preload");
    return;
  }

  const initialDelayMs = Number(process.env.BOOKMARKS_PRELOAD_DELAY_MS ?? "5000");
  const intervalMs = Number(process.env.BOOKMARKS_PRELOAD_INTERVAL_MS ?? "7200000");

  const timeoutId = setTimeout(() => {
    void preloadBookmarksIfNeeded();

    // Keep data warm.
    preloadIntervalId = setInterval(() => {
      void preloadBookmarksIfNeeded();
    }, intervalMs);
    // Allow Node to exit gracefully if nothing else is keeping it alive
    preloadIntervalId.unref();
  }, initialDelayMs);
  timeoutId.unref();

  // Proper cleanup on process termination
  if (process.env.NODE_ENV !== "test") {
    const cleanup = () => {
      if (preloadIntervalId) {
        clearInterval(preloadIntervalId);
        preloadIntervalId = null;
      }
      clearTimeout(timeoutId);
    };

    process.on("SIGTERM", cleanup);
    process.on("SIGINT", cleanup);
    process.on("beforeExit", cleanup);
  }
}
