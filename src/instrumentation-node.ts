// Node-only instrumentation logic extracted to keep Edge bundle free of unsupported APIs.
// This file MUST NOT be imported in the Edge runtime – `instrumentation.ts` loads it
// dynamically only when running inside the Node.js runtime.

// Indicate this module should be evaluated only in the Node.js runtime so Turbopack skips Edge bundling.
export const runtime = "nodejs";

// Singleton guard to prevent duplicate registration during Next.js HMR in development
declare global {
  var INSTRUMENTATION_NODE_INSTALLED: boolean | undefined;
}

// Cache the Sentry module during register() so onRequestError can use it synchronously
let SentryModule: typeof import("@sentry/nextjs") | null = null;

export async function register(): Promise<void> {
  const releaseVersion =
    process.env.SENTRY_RELEASE ||
    process.env.NEXT_PUBLIC_GIT_HASH ||
    process.env.NEXT_PUBLIC_APP_VERSION;
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
  if (isBuildPhase) return;

  // If we've already registered in this process (e.g., due to HMR), skip re-registering
  if (globalThis.INSTRUMENTATION_NODE_INSTALLED) return;
  globalThis.INSTRUMENTATION_NODE_INSTALLED = true;

  /** ------------------------------------------------------------------
   * Configure Node core behaviors & diagnostics
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
    SentryModule = Sentry; // Cache for synchronous use in onRequestError
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      release: releaseVersion,
      // Next.js 16 cache components can throw `next-prerender-crypto` when
      // OpenTelemetry detectors call random UUID APIs during static route rendering.
      // Keep Sentry error reporting enabled while disabling OTel auto-setup.
      skipOpenTelemetrySetup: true,
      tracesSampleRate: 0.25,

      // Server-side integrations for enhanced error context
      integrations: [
        // Format Zod validation errors for better readability
        Sentry.zodErrorsIntegration({ limit: 10 }),

        // Capture error.cause chain for debugging nested errors
        Sentry.extraErrorDataIntegration({ depth: 3, captureErrorCause: true }),

        // Deduplicate identical errors to reduce noise
        Sentry.dedupeIntegration(),
      ],
    });
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
    const { JINA_FETCH_STORE_NAME, JINA_FETCH_RATE_LIMIT_S3_PATH } =
      await import("@/lib/constants");
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

  /** Schedule bookmark preloads (production runtime only, skip during phase-production-build) **/
  const isProductionRuntime =
    process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build";
  if (isProductionRuntime) {
    try {
      const bookmarksModule = await import("@/lib/bookmarks/refresh-logic.server");
      bookmarksModule.initializeBookmarksDataAccess?.();
    } catch {
      /* ignore bookmark preload failure */
    }
  } else if (process.env.NODE_ENV === "production") {
    console.info("[Instrumentation] Skipping bookmarks preload during build phase.");
  }
}

// DO NOT call register() immediately - it should only be invoked by the
// instrumentation hook in src/instrumentation.ts after the dynamic import.

/**
 * onRequestError hook – invoked by the Sentry SDK (Next.js ≥15.4)
 * to capture errors originating from nested React Server Components.
 *
 * The function signature is dictated by the Sentry SDK:
 *   (error: unknown) => void
 *
 * It must synchronously call `Sentry.captureRequestError` so that the
 * SDK can link the error to the current request context.
 *
 * @see https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#errors-from-nested-react-server-components
 */
export function onRequestError(
  error: unknown,
  request:
    | RequestInfo
    | Request
    | { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  errorContext: Record<string, unknown>,
): void {
  // Use cached Sentry module for synchronous request context linking
  // SentryModule is populated during register() when SENTRY_DSN is set
  if (!SentryModule) {
    // Fallback: if register() hasn't completed but Sentry is configured,
    // do a lazy import (loses request context but still captures error)
    if (process.env.NODE_ENV === "production" && process.env.SENTRY_DSN) {
      void (async () => {
        const Sentry = await import("@sentry/nextjs");
        Sentry.captureException?.(error);
      })();
    }
    return;
  }

  const Sentry = SentryModule;

  const normalizeRequest = (
    req: typeof request,
  ): { path: string; method: string; headers: Record<string, string | string[] | undefined> } => {
    if (typeof req === "string") {
      return { path: req, method: "GET", headers: {} };
    }
    if (req instanceof Request) {
      return {
        path: new URL(req.url).pathname,
        method: req.method,
        headers: Object.fromEntries(req.headers.entries()),
      };
    }
    return req;
  };

  const safeRequest = normalizeRequest(request);
  if (typeof Sentry.captureRequestError === "function") {
    // Forward all required parameters per SDK typing
    if (
      errorContext &&
      typeof errorContext === "object" &&
      "routerKind" in errorContext &&
      "routePath" in errorContext &&
      "routeType" in errorContext &&
      typeof (errorContext as { routerKind: unknown }).routerKind === "string" &&
      typeof (errorContext as { routePath: unknown }).routePath === "string" &&
      typeof (errorContext as { routeType: unknown }).routeType === "string"
    ) {
      Sentry.captureRequestError(
        error,
        safeRequest,
        errorContext as {
          routerKind: string;
          routePath: string;
          routeType: string;
        },
      );
    } else {
      // Fallback: still capture error without context
      Sentry.captureException?.(error);
    }
  } else {
    // Fallback to the generic captureException for older SDKs
    Sentry.captureException?.(error);
  }
}
