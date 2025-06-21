import * as Sentry from "@sentry/nextjs";
// Centralised, non-blocking bookmark warm-up logic
// import { scheduleBackgroundBookmarkPreload } from "./lib/bookmarks/bookmarks-preloader.server";

// Lazy import EventEmitter to avoid Edge/browser bundling issues
let EventEmitter: typeof import("node:events").EventEmitter | undefined;

export async function register() {
  const releaseVersion = process.env.NEXT_PUBLIC_APP_VERSION || process.env.SENTRY_RELEASE;
  const isNodeRuntime = process.env.NEXT_RUNTIME === "nodejs";
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

  console.log(`[Instrumentation] Runtime: ${process.env.NEXT_RUNTIME || "unknown"}, Build phase: ${isBuildPhase}`);

  // CRITICAL: Skip all initialization during build phase to prevent blocking I/O
  if (isBuildPhase) {
    console.log("[Instrumentation] Build phase detected - skipping all initialization to prevent blocking I/O");
    return;
  }

  if (isNodeRuntime && !isBuildPhase) {
    // Configure Sharp memory settings before any usage
    import("sharp")
      .then((sharp) => {
        // Disable Sharp's internal cache completely to prevent memory retention
        sharp.cache({ files: 0, items: 0, memory: 0 });
        // Limit concurrency to reduce memory spikes
        sharp.concurrency(1);
        console.log(
          "[Instrumentation] Sharp configured: cache fully disabled (files: 0, items: 0, memory: 0), concurrency set to 1",
        );
      })
      .catch((err) => {
        console.warn("[Instrumentation] Failed to configure Sharp:", err);
      });

    // Initialize ImageMemoryManager singleton by importing it.
    // This replaces the deprecated mem-guard.
    import("@/lib/image-memory-manager");

    // Use dynamic import with computed string to prevent static analysis
    const nodeModuleName = "node" + ":" + "events";
    const nodeEvents = await import(nodeModuleName);
    EventEmitter = nodeEvents.EventEmitter;

    // Increase the default max listeners to handle concurrent fetch operations
    // This prevents the "MaxListenersExceededWarning" when processing bookmarks in batches
    if (EventEmitter) {
      EventEmitter.defaultMaxListeners = 25;
    }

    // Note: process.setMaxListeners is not available in Edge runtime
    // EventEmitter.defaultMaxListeners should be sufficient

    // Only initialize Sentry in production to save memory in development
    if (process.env.NODE_ENV === "production" && process.env.SENTRY_DSN) {
      // Initialize Sentry for the Node.js runtime
      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        release: releaseVersion,
        // Adjust this value in production, or use tracesSampler for greater control
        tracesSampleRate: 1.0,
        // Setting this option to true will print useful information to the console while you're setting up Sentry.
        debug: false,
      });
    }

    // ----------------------------------------------------------------------------
    // Background Bookmark Pre-loader
    // ----------------------------------------------------------------------------
    // Re-enable bookmark preloading in a manner that never blocks server startup.
    //  • Runs only in the Node runtime (not Edge) and only in production by default
    //  • Executes after a short, configurable delay to avoid competing with
    //    health-check probes and cold-start traffic.
    //  • Refreshes periodically (default every 2 hours) so data stays warm.

    if (process.env.NODE_ENV === "production") {
      // Use dynamic import with computed string for bookmarks module
      const bookmarksModulePath = "@/lib/bookmarks/" + "bookmarks-data-access.server";
      const bookmarksModule = await import(bookmarksModulePath);
      bookmarksModule.initializeBookmarksDataAccess();

      // Use setTimeout(0) instead of setImmediate for Edge compatibility
      setTimeout(async () => {
        console.log("[Instrumentation] Triggering initial bookmark preload (non-blocking)");
        try {
          const { monitoredAsync } = await import("@/lib/async-operations-monitor");
          const { getBookmarks } = await import("@/lib/bookmarks/bookmarks-data-access.server");

          await monitoredAsync(
            null,
            "Initial Bookmark Preload",
            async () => {
              const bookmarks = await getBookmarks(true); // skipExternalFetch = true
              console.log(`[Instrumentation] Initial bookmark preload completed: ${bookmarks.length} bookmarks loaded`);
              return bookmarks;
            },
            {
              timeoutMs: 30000,
              metadata: { source: "instrumentation", initial: true },
            },
          );
        } catch (err) {
          console.error("[Instrumentation] Initial bookmark preload failed:", err);
          // Import Sentry dynamically to avoid issues
          const Sentry = await import("@sentry/nextjs");
          Sentry.captureException(err);
        }
      }, 0);

      // Schedule periodic refreshes
      import("@/lib/bookmarks/bookmarks-preloader.server").then(({ scheduleBackgroundBookmarkPreload }) => {
        scheduleBackgroundBookmarkPreload();
      });
    }
  }

  if (
    process.env.NEXT_RUNTIME === "edge" &&
    !isBuildPhase &&
    process.env.NODE_ENV === "production" &&
    process.env.SENTRY_DSN
  ) {
    // Initialize Sentry for the Edge runtime - only in production
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
