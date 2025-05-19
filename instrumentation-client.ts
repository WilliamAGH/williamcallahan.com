// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

// Define browser extension error patterns to filter out
const BROWSER_EXTENSION_ERROR_PATTERNS = [
  'runtime.sendMessage',
  'Tab not found',
  'chrome.runtime',
  'browser.runtime',
  'Extension context invalidated'
];

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Associate errors with the correct source map
  release: process.env.NEXT_PUBLIC_APP_VERSION,

  // Add optional integrations for additional features
  integrations: [
    Sentry.replayIntegration(),
  ],

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,

  // Define how likely Replay events are sampled.
  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: 1.0,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Filter out events from localhost in development to prevent console warnings
  beforeSend(event) {
    // Check if it's a development environment
    if (process.env.NODE_ENV === 'development') {
      // Optionally, you could inspect the event further, e.g., hint.originalException
      // For now, simply drop all events in development to suppress the warning
      console.log('Sentry event dropped in development:', event); // Optional: Log dropped events for debugging
      return null; // Drop the event
    }

    // Filter browser extension errors in all environments
    const errorMessage = event.exception?.values?.[0]?.value || '';

    // Check for known browser extension error patterns
    for (const pattern of BROWSER_EXTENSION_ERROR_PATTERNS) {
      if (errorMessage.includes(pattern)) {
        console.log('Filtering browser extension error:', errorMessage);
        return null; // Drop the event
      }
    }

    // Special case for generic extension errors
    if (errorMessage.includes('extension') && errorMessage.includes('not found')) {
      console.log('Filtering generic extension error:', errorMessage);
      return null; // Drop the event
    }

    // In production or other environments, send all other events
    return event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
