import { EventEmitter } from "node:events";
import * as Sentry from "@sentry/nextjs";

// Global flags to prevent multiple concurrent preloading attempts and repeated preloads
let isPreloading = false;
let hasPreloaded = false;
let preloadPromise: Promise<void> | null = null;

export function register() {
  const releaseVersion = process.env.NEXT_PUBLIC_APP_VERSION || process.env.SENTRY_RELEASE;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Increase the default max listeners to handle concurrent fetch operations
    // This prevents the "MaxListenersExceededWarning" when processing bookmarks in batches
    EventEmitter.defaultMaxListeners = 25;

    // Also set it on the global process object to be safe
    if (process.setMaxListeners) {
      process.setMaxListeners(25);
    }
    // Initialize Sentry for the Node.js runtime
    Sentry.init({
      dsn:
        process.env.SENTRY_DSN ||
        "https://f1769f8b48304aabc42fee1425b225d4@o4509274058391557.ingest.us.sentry.io/4509274059309056",
      release: releaseVersion,
      // Adjust this value in production, or use tracesSampler for greater control
      tracesSampleRate: 1.0,
      // Setting this option to true will print useful information to the console while you're setting up Sentry.
      debug: false,
    });

    // Preload bookmarks into server cache at startup (Keep this server-side logic here for now)
    // Make this non-blocking and debounced to prevent interference with health checks
    if (process.env.NODE_ENV === "production") {
      // Don't block server startup - preload in background after a delay
      setImmediate(() => {
        void preloadBookmarksIfNeeded();
      });
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    // Initialize Sentry for the Edge runtime
    Sentry.init({
      dsn:
        process.env.SENTRY_DSN ||
        "https://f1769f8b48304aabc42fee1425b225d4@o4509274058391557.ingest.us.sentry.io/4509274059309056",
      release: releaseVersion,
      // Adjust this value in production, or use tracesSampler for greater control
      tracesSampleRate: 1.0,
      // Setting this option to true will print useful information to the console while you're setting up Sentry.
      debug: false,
    });
  }
}

/**
 * Safely preload bookmarks with debouncing and error handling
 */
async function preloadBookmarksIfNeeded(): Promise<void> {
  // If already preloading, return the existing promise
  if (isPreloading && preloadPromise) {
    return preloadPromise;
  }

  // If already preloaded, skip
  if (hasPreloaded) {
    return Promise.resolve();
  }

  isPreloading = true;

  preloadPromise = (async () => {
    try {
      // Add a small delay to ensure server is fully ready
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Dynamic import to avoid issues with Next.js bundling
      const { fetchExternalBookmarks } = await import("./lib/bookmarks.client");
      console.log("Preloading bookmarks into server cache...");

      // Set a timeout to prevent hanging
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Preload timeout after 30 seconds")), 30000);
      });

      await Promise.race([fetchExternalBookmarks(), timeoutPromise]);

      console.log("Bookmarks preloaded successfully");
    } catch (error) {
      console.error("Failed to preload bookmarks:", error);
      // Don't throw - just log the error to prevent server startup issues
    } finally {
      hasPreloaded = true;
      isPreloading = false;
      preloadPromise = null;
    }
  })();

  return preloadPromise;
}

export const onRequestError = Sentry.captureRequestError;
