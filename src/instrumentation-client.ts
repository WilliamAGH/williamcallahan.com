/**
 * Client-side Sentry configuration
 *
 * Initializes error tracking and performance monitoring for browser sessions
 * @see https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */

import * as Sentry from "@sentry/nextjs";

/**
 * Common browser extension error patterns to filter from error reporting
 * Prevents unnecessary noise from extension conflicts
 */
const NON_CRITICAL_ERROR_PATTERNS = [
  'can\'t redefine non-configurable property "ethereum"',
  "Load failed",
];

const BROWSER_EXTENSION_ERROR_PATTERNS = [
  "runtime.sendMessage",
  "Tab not found",
  "chrome.runtime",
  "browser.runtime",
  "Extension context invalidated",
  "moz-extension://",
  "chrome-extension://",
  "script error",
  "Non-Error promise rejection captured",
  ...NON_CRITICAL_ERROR_PATTERNS,
];

/**
 * Determines if an error should be filtered out based on browser extension patterns
 * @param errorMessage - The error message to check
 * @returns true if the error should be filtered out, false otherwise
 */
export function shouldFilterError(errorMessage: string): boolean {
  const normalizedMessage = errorMessage.toLowerCase();
  // Check for known browser extension error patterns
  for (const pattern of BROWSER_EXTENSION_ERROR_PATTERNS) {
    if (normalizedMessage.includes(pattern.toLowerCase())) {
      return true;
    }
  }

  // Special case for generic extension errors
  if (normalizedMessage.includes("extension") && normalizedMessage.includes("not found")) {
    return true;
  }

  return false;
}

// Only initialize Sentry in production to prevent development console noise
if (process.env.NODE_ENV === "production") {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tunnel: "/api/tunnel",

    // Associate errors with the correct source map
    release: process.env.NEXT_PUBLIC_GIT_HASH || process.env.NEXT_PUBLIC_APP_VERSION,

    // Integrations for comprehensive error tracking and performance monitoring
    integrations: [
      // Session replay for debugging user interactions leading to errors
      Sentry.replayIntegration(),

      // Filter errors originating exclusively from third-party code (browser extensions, injected scripts)
      // Uses stack frame analysis with applicationKey from bundler plugin for robust detection
      // Defense-in-depth: works alongside beforeSend pattern matching below
      Sentry.thirdPartyErrorFilterIntegration({
        filterKeys: ["williamcallahan-com"],
        behaviour: "drop-error-if-exclusively-contains-third-party-frames",
      }),

      // Format Zod validation errors for better readability in Sentry
      // Flattens nested paths and provides structured issue display
      Sentry.zodErrorsIntegration({
        limit: 10, // Max issues to inline per error
        saveZodIssuesAsAttachment: false, // Keep payload size reasonable
      }),

      // Capture additional error properties including error.cause chain
      // Essential for debugging errors with nested causes
      Sentry.extraErrorDataIntegration({
        depth: 3, // Capture up to 3 levels of nested data
        captureErrorCause: true, // Capture Error.cause for chained errors
      }),

      // Capture failed HTTP requests (5xx errors) as Sentry events
      // Targets internal API routes to avoid noise from external failures
      Sentry.httpClientIntegration({
        failedRequestStatusCodes: [[500, 599]], // Server errors only
        failedRequestTargets: [/\/api\//], // Only internal API routes
      }),

      // Next.js-specific browser tracing for performance monitoring
      // Captures page loads, navigations, and Web Vitals
      Sentry.browserTracingIntegration({
        enableInp: true, // Interaction to Next Paint
        enableLongTask: true, // Long task detection
        enableLongAnimationFrame: true, // Long animation frame detection
      }),

      // Capture browser deprecation warnings and interventions
      // Helps identify compatibility issues before they become problems
      Sentry.reportingObserverIntegration({
        types: ["crash", "deprecation", "intervention"],
      }),
    ],

    // Production sample rates (0.25 = 25% of transactions to avoid Sentry rate limits)
    tracesSampleRate: 0.25,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    // Setting this option to true will print useful information to the console while you're setting up Sentry.
    debug: false,

    // Filter out browser extension errors
    beforeSend(event) {
      const errorMessage = event.exception?.values?.[0]?.value || "";
      return shouldFilterError(errorMessage) ? null : event;
    },
  });
}

const matchesNonCriticalPattern = (message: string | undefined): boolean => {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();
  return NON_CRITICAL_ERROR_PATTERNS.some((pattern) => normalized.includes(pattern.toLowerCase()));
};

if (typeof window !== "undefined") {
  window.addEventListener(
    "error",
    (event) => {
      if (matchesNonCriticalPattern(event.message)) {
        event.preventDefault();
      }
    },
    true,
  );

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason as unknown;
    const message =
      typeof reason === "string"
        ? reason
        : reason && typeof reason === "object" && "message" in reason
          ? String((reason as { message?: unknown }).message)
          : "";

    if (matchesNonCriticalPattern(message)) {
      event.preventDefault();
    }
  });
}

/**
 * Captures router transition start events for performance monitoring
 * Re-exported from Sentry for use in application code
 * Returns no-op function in development
 */
export const onRouterTransitionStart =
  process.env.NODE_ENV === "production" ? Sentry.captureRouterTransitionStart : () => {};

/**
 * Dev-only console noise filter
 * Suppress React-server warning: "Single item size exceeds maxSize" which is
 * harmless and triggered when serialized RSC payload > 16 KB. This keeps the
 * developer console readable without affecting production builds.
 */
if (process.env.NODE_ENV !== "production") {
  const ORIGINAL_WARN = console.warn.bind(console);

  console.warn = (...args: unknown[]): void => {
    const firstArg = args[0];
    if (typeof firstArg === "string" && firstArg.includes("Single item size exceeds maxSize")) {
      // Silently ignore this dev-only warning
      return;
    }
    ORIGINAL_WARN(...args);
  };
}
