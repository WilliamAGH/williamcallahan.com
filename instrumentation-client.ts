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
];

/**
 * Determines if an error should be filtered out based on browser extension patterns
 * @param errorMessage - The error message to check
 * @returns true if the error should be filtered out, false otherwise
 */
export function shouldFilterError(errorMessage: string): boolean {
  // Check for known browser extension error patterns
  for (const pattern of BROWSER_EXTENSION_ERROR_PATTERNS) {
    if (errorMessage.includes(pattern)) {
      return true;
    }
  }

  // Special case for generic extension errors
  if (errorMessage.includes("extension") && errorMessage.includes("not found")) {
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
    release: process.env.NEXT_PUBLIC_APP_VERSION,

    // Add optional integrations for additional features
    integrations: [Sentry.replayIntegration()],

    // Production sample rates
    tracesSampleRate: 1,
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

/**
 * Captures router transition start events for performance monitoring
 * Re-exported from Sentry for use in application code
 * Returns no-op function in development
 */
export const onRouterTransitionStart =
  process.env.NODE_ENV === "production" ? Sentry.captureRouterTransitionStart : () => {};
