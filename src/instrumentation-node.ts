// Node-only instrumentation logic extracted to keep Edge bundle free of unsupported APIs.
// This file MUST NOT be imported in the Edge runtime – `instrumentation.ts` loads it
// dynamically only when running inside the Node.js runtime.

// Indicate this module should be evaluated only in the Node.js runtime so Turbopack skips Edge bundling.
export const runtime = "nodejs";

// Singleton guard to prevent duplicate registration during Next.js HMR in development
declare global {
  var INSTRUMENTATION_NODE_INSTALLED: boolean | undefined;
}

// Canonical Sentry environment resolver — shared across Node, Edge, and Client.
// See src/lib/sentry/resolve-environment.ts for documentation.
// Dynamic import is used in register() to keep this module side-effect-free.

export async function register(): Promise<void> {
  const releaseVersion =
    process.env.SENTRY_RELEASE ||
    process.env.NEXT_PUBLIC_GIT_HASH ||
    process.env.NEXT_PUBLIC_APP_VERSION;
  const phaseKey = "NEXT_PHASE";
  const isBuildPhase = process.env[phaseKey] === "phase-production-build";
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

  /** Sentry (Node) **/
  if (process.env.NODE_ENV === "production" && process.env.SENTRY_DSN) {
    const Sentry = await import("@sentry/nextjs");
    // Ref: @sentry/nextjs 10.27.0 server/index.js:111 — SDK defaults environment to
    // SENTRY_ENVIRONMENT || VERCEL_ENV || NODE_ENV. We override with a deployment-
    // specific name derived from NEXT_PUBLIC_SITE_URL so Sentry issues distinguish
    // alpha/dev/production deployments instead of showing a generic "production".
    const { resolveSentryEnvironment } = await import("@/lib/sentry/resolve-environment");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      release: releaseVersion,
      environment: resolveSentryEnvironment(),
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
  } catch (error) {
    console.warn(
      "[Instrumentation] Failed to warm image manifests at startup; production runtime will use logo fallbacks until warm-up succeeds.",
      error,
    );
  }

  /** Load global Jina AI rate-limit store bootstrap **/
  try {
    const { loadRateLimitStore } = await import("@/lib/rate-limiter");
    const { JINA_FETCH_STORE_NAME, JINA_FETCH_RATE_LIMIT_STORE_KEY } =
      await import("@/lib/constants");
    await loadRateLimitStore(JINA_FETCH_STORE_NAME, JINA_FETCH_RATE_LIMIT_STORE_KEY);
  } catch (err) {
    console.warn("[Instrumentation] Unable to load Jina rate-limit store bootstrap:", err);
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
    process.env.NODE_ENV === "production" && process.env[phaseKey] !== "phase-production-build";
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
