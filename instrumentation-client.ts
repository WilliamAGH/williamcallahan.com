// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

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
    // Check if it's an error event and if we are in development
    if (process.env.NODE_ENV === 'development') {
      // Optionally, you could inspect the event further, e.g., hint.originalException
      // For now, simply drop all events in development to suppress the warning
      console.log('Sentry event dropped in development:', event); // Optional: Log dropped events for debugging
      return null; // Drop the event
    }
    // In production or other environments, send the event
    return event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
