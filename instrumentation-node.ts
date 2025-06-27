// Node-only instrumentation logic extracted to keep Edge bundle free of unsupported APIs.
// This file MUST NOT be imported in the Edge runtime – `instrumentation.ts` loads it
// dynamically only when running inside the Node.js runtime.

// Indicate this module should be evaluated only in the Node.js runtime so Turbopack skips Edge bundling.
export const runtime = "nodejs";

export async function register(): Promise<void> {
  const releaseVersion = process.env.NEXT_PUBLIC_APP_VERSION || process.env.SENTRY_RELEASE;
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
  if (isBuildPhase) return;

  /** ------------------------------------------------------------------
   * Configure Node core behaviours & diagnostics
   * ------------------------------------------------------------------ */
  try {
    // Dynamically import to keep Edge bundle clean and maintain type safety
    const events = await import("node:events");
    const EventEmitter = events.EventEmitter || events.default;
    if (EventEmitter && typeof EventEmitter.defaultMaxListeners === "number") {
      EventEmitter.defaultMaxListeners = 25;
    }
  } catch {
    /* ignore failed EventEmitter tweak */
  }

  // Global unhandled-rejection guard
  process.on("unhandledRejection", (reason: unknown) => {
    console.error("[Instrumentation] Unhandled Promise Rejection:", reason);
  });

  /** Memory monitoring & emergency GC / recycle **/
  if (process.memoryUsage) {
    const monitor = setInterval(() => {
      const { rss, heapUsed, external, heapTotal } = process.memoryUsage();
      const rssMb = Math.round(rss / 1024 / 1024);
      const nativeMb = Math.round((rss - heapTotal) / 1024 / 1024);

      if (rssMb > 1500) {
        console.log(
          `[Memory] RSS ${rssMb} MB (heap ${Math.round(heapUsed / 1024 / 1024)} MB, external ${Math.round(external / 1024 / 1024)} MB, native ${nativeMb} MB)`,
        );
      }

      if (nativeMb > 2048) {
        console.warn(`[Memory] High native usage ${nativeMb} MB`);
      }

      if (global.gc && rssMb > 3000) {
        console.log("♻️  Forcing GC – RSS > 3 GB");
        global.gc();
      }
    }, 30_000);
    monitor.unref?.();

    const tidy = () => clearInterval(monitor);
    process.on("SIGTERM", tidy);
    process.on("SIGINT", tidy);
    process.on("beforeExit", tidy);
  }

  /** Sentry (Node) **/
  if (process.env.NODE_ENV === "production" && process.env.SENTRY_DSN) {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({ dsn: process.env.SENTRY_DSN, release: releaseVersion, tracesSampleRate: 1 });
  }

  /** Image manifest warm-up **/
  try {
    const { loadImageManifests } = await import("@/lib/image-handling/image-manifest-loader");
    await loadImageManifests();
  } catch {
    /* ignore manifest load failure */
  }

  /** Load global Jina AI rate-limit store **/
  try {
    const { loadRateLimitStoreFromS3 } = await import("@/lib/rate-limiter");
    const { JINA_FETCH_STORE_NAME, JINA_FETCH_RATE_LIMIT_S3_PATH } = await import("@/lib/constants");
    await loadRateLimitStoreFromS3(JINA_FETCH_STORE_NAME, JINA_FETCH_RATE_LIMIT_S3_PATH);
  } catch (err) {
    console.warn("[Instrumentation] Unable to load Jina rate-limit store:", err);
  }

  /**
   * Dev-only console noise filter for server warnings produced by Next.js
   * Example: "⚠ You are using an experimental edge runtime, the API might change."
   */
  if (process.env.NODE_ENV !== "production") {
    const ORIGINAL_WARN = console.warn.bind(console);

    console.warn = (...args: unknown[]): void => {
      const firstArg = args[0];
      if (typeof firstArg === "string" && firstArg.includes("experimental edge runtime")) {
        // Suppress this specific warning
        return;
      }
      ORIGINAL_WARN(...args);
    };
  }

  /** Schedule bookmark preloads (production only) **/
  if (process.env.NODE_ENV === "production") {
    try {
      const bookmarksModule = await import("@/lib/bookmarks/bookmarks-data-access.server");
      bookmarksModule.initializeBookmarksDataAccess?.();
    } catch {
      /* ignore bookmark preload failure */
    }
  }
}

// Call register() immediately when this module is imported
// This ensures Node.js instrumentation runs when imported from instrumentation.ts
void register();
