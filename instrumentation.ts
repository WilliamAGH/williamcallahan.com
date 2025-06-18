import * as Sentry from "@sentry/nextjs";
// Centralised, non-blocking bookmark warm-up logic
import { scheduleBackgroundBookmarkPreload } from "./lib/server/bookmarks-preloader";

// Lazy import EventEmitter to avoid Edge/browser bundling issues
let EventEmitter: typeof import("node:events").EventEmitter | undefined;

export function register() {
  const releaseVersion = process.env.NEXT_PUBLIC_APP_VERSION || process.env.SENTRY_RELEASE;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Dynamic import only in the Node runtime to keep the Edge bundle clean
    // Using `import()` avoids static analysis pulling this into the Edge chunks
    const nodeEvents = require("node:events");
    EventEmitter = nodeEvents.EventEmitter;

    // Increase the default max listeners to handle concurrent fetch operations
    // This prevents the "MaxListenersExceededWarning" when processing bookmarks in batches
    if (EventEmitter) {
      EventEmitter.defaultMaxListeners = 25;
    }

    // Also set it on the global process object to be safe
    if (process.setMaxListeners) {
      process.setMaxListeners(25);
    }
    // Initialize Sentry for the Node.js runtime
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      release: releaseVersion,
      // Adjust this value in production, or use tracesSampler for greater control
      tracesSampleRate: 1.0,
      // Setting this option to true will print useful information to the console while you're setting up Sentry.
      debug: false,
    });

    // ----------------------------------------------------------------------------
    // Background Bookmark Pre-loader
    // ----------------------------------------------------------------------------
    // Re-enable bookmark preloading in a manner that never blocks server startup.
    //  • Runs only in the Node runtime (not Edge) and only in production by default
    //  • Executes after a short, configurable delay to avoid competing with
    //    health-check probes and cold-start traffic.
    //  • Refreshes periodically (default every 2 hours) so data stays warm.

    if (process.env.NODE_ENV === "production") {
      scheduleBackgroundBookmarkPreload();
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    // Initialize Sentry for the Edge runtime
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      release: releaseVersion,
      // Adjust this value in production, or use tracesSampler for greater control
      tracesSampleRate: 1.0,
      // Setting this option to true will print useful information to the console while you're setting up Sentry.
      debug: false,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
