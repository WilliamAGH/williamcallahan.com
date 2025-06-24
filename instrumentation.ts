import * as Sentry from "@sentry/nextjs";
import type { EventEmitterStatic } from "@/types/lib";

// Lazy import EventEmitter to avoid Edge/browser bundling issues
let EventEmitter: EventEmitterStatic | undefined;

export async function register() {
  const releaseVersion = process.env.NEXT_PUBLIC_APP_VERSION || process.env.SENTRY_RELEASE;
  const runtime = process.env.NEXT_RUNTIME;
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

  console.log(`[Instrumentation] Runtime: ${runtime || "unknown"}, Build phase: ${isBuildPhase}`);

  // CRITICAL: Skip all initialization during build phase to prevent blocking I/O
  if (isBuildPhase) {
    console.log("[Instrumentation] Build phase detected - skipping all initialization to prevent blocking I/O");
    return;
  }

  // Only proceed with Node.js specific initialization if we're in Node.js runtime
  if (runtime === "nodejs" && typeof window === 'undefined') {
    // Configure Sharp memory settings before any usage
    try {
      const sharpModule = await import("sharp");
      const sharp = sharpModule.default || sharpModule;
      
      // Check if cache method exists before calling it
      if (typeof sharp.cache === 'function') {
        // Disable Sharp's internal cache completely to prevent memory retention
        sharp.cache({ files: 0, items: 0, memory: 0 });
        console.log("[Instrumentation] Sharp cache disabled (files: 0, items: 0, memory: 0)");
      } else {
        console.log("[Instrumentation] Sharp cache method not available");
      }
      
      // Check if concurrency method exists before calling it
      if (typeof sharp.concurrency === 'function') {
        // Limit concurrency to reduce memory spikes
        sharp.concurrency(1);
        console.log("[Instrumentation] Sharp concurrency set to 1");
      } else {
        console.log("[Instrumentation] Sharp concurrency method not available");
      }
    } catch (err) {
      console.warn("[Instrumentation] Failed to configure Sharp:", err);
    }

    // Initialize ImageMemoryManager singleton by importing it.
    try {
      await import("@/lib/image-memory-manager");
    } catch (err) {
      console.warn("[Instrumentation] Failed to import image-memory-manager:", err);
    }

    // Import node:events only in actual Node.js environment
    try {
      // Use require for better compatibility in production builds
      const events = require("node:events");
      EventEmitter = events.EventEmitter;
      
      if (EventEmitter && typeof EventEmitter.defaultMaxListeners === 'number') {
        // This prevents the "MaxListenersExceededWarning" when processing bookmarks in batches
        EventEmitter.defaultMaxListeners = 25;
        console.log("[Instrumentation] EventEmitter loaded and max listeners set to 25.");
      }
    } catch (err) {
      console.warn("[Instrumentation] Failed to load events module:", err);
    }

    // Add global unhandled promise rejection handler to prevent health check timeouts
    process.on('unhandledRejection', (reason) => {
      console.error('[Instrumentation] Unhandled Promise Rejection:', reason);
      // In production, capture with Sentry
      if (process.env.NODE_ENV === "production" && process.env.SENTRY_DSN) {
        try {
          Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason)));
        } catch (sentryErr) {
          console.error('[Instrumentation] Failed to capture unhandled rejection with Sentry:', sentryErr);
        }
      }
    });

    // Monitor memory usage in development
    if (process.env.NODE_ENV === "development") {
      const monitorInterval = setInterval(() => {
        const usage = process.memoryUsage();
        const rss = Math.round(usage.rss / 1024 / 1024);
        const heap = Math.round(usage.heapUsed / 1024 / 1024);
        const external = Math.round(usage.external / 1024 / 1024);
        const nativeMemory = Math.round((usage.rss - usage.heapTotal) / 1024 / 1024);
        
        // Only log if memory is high
        if (rss > 1000) {
          console.log(
            `[Memory Monitor] RSS: ${rss}MB, Heap: ${heap}MB, External: ${external}MB, Native: ${nativeMemory}MB`
          );
        }
        
        // Warn if native memory is high (indicates memory leak in native modules like Sharp)
        if (nativeMemory > 1024) { // 1GB
          console.warn(`[Memory Monitor] High native memory: ${nativeMemory}MB`);
        }
        
        // Force garbage collection if available and memory is very high
        if (global.gc && rss > 1500) {
          console.log('[Memory Monitor] Forcing garbage collection due to high memory usage');
          global.gc();
        }
      }, 30000); // Every 30 seconds
      
      // Don't prevent process exit
      if (monitorInterval.unref) {
        monitorInterval.unref();
      }
    }

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
      // Import bookmarks module directly
      try {
        const bookmarksModule = await import("@/lib/bookmarks/bookmarks-data-access.server");
        if (bookmarksModule.initializeBookmarksDataAccess) {
          bookmarksModule.initializeBookmarksDataAccess();
        }
      } catch (err) {
        console.warn("[Instrumentation] Failed to import bookmarks module:", err);
      }

      // Use setTimeout for better compatibility
      if (typeof setTimeout === 'function') {
        setTimeout(async () => {
          console.log("[Instrumentation] Triggering initial bookmark preload (non-blocking)");
          try {
            const { monitoredAsync } = await import("@/lib/async-operations-monitor");
            const { getBookmarks } = await import("@/lib/bookmarks/bookmarks-data-access.server");

            await monitoredAsync(
              null,
              "Initial Bookmark Preload",
              async () => {
                const bookmarks = await getBookmarks({ skipExternalFetch: true });
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
            try {
              const SentryModule = await import("@sentry/nextjs");
              if (SentryModule.captureException) {
                SentryModule.captureException(err);
              }
            } catch (sentryErr) {
              console.error("[Instrumentation] Failed to capture exception with Sentry:", sentryErr);
            }
          }
        }, 0);
      }

      // Schedule periodic refreshes
      import("@/lib/bookmarks/bookmarks-preloader.server")
        .then(({ scheduleBackgroundBookmarkPreload }) => {
          if (scheduleBackgroundBookmarkPreload) {
            scheduleBackgroundBookmarkPreload();
          }
        })
        .catch((err) => {
          console.warn("[Instrumentation] Failed to schedule bookmark preloads:", err);
        });
    }
  }

  // Initialize Sentry for Edge runtime if applicable
  if (runtime === "edge" && !isBuildPhase && process.env.NODE_ENV === "production" && process.env.SENTRY_DSN) {
    console.log("[Instrumentation] Initializing Sentry for Edge runtime");
    try {
      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        release: releaseVersion,
        // Adjust this value in production, or use tracesSampler for greater control
        tracesSampleRate: 1.0,
        // Setting this option to true will print useful information to the console while you're setting up Sentry.
        debug: false,
      });
    } catch (err) {
      console.error("[Instrumentation] Failed to initialize Sentry for Edge runtime:", err);
    }
  }
}

export const onRequestError = Sentry.captureRequestError;
