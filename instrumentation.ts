import * as Sentry from '@sentry/nextjs';

export async function register() {
  const releaseVersion = process.env.NEXT_PUBLIC_APP_VERSION || process.env.SENTRY_RELEASE;

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Initialize Sentry for the Node.js runtime
    Sentry.init({
      dsn: process.env.SENTRY_DSN || "https://f1769f8b48304aabc42fee1425b225d4@o4509274058391557.ingest.us.sentry.io/4509274059309056",
      release: releaseVersion,
      // Adjust this value in production, or use tracesSampler for greater control
      tracesSampleRate: 1.0,
      // Setting this option to true will print useful information to the console while you're setting up Sentry.
      debug: false,
    });

    // Preload bookmarks into server cache at startup (Keep this server-side logic here for now)
    if (process.env.NODE_ENV === 'production') {
      try {
        // Dynamic import to avoid issues with Next.js bundling
        const { fetchExternalBookmarks } = await import('./lib/bookmarks.client');
        console.log('Preloading bookmarks into server cache...');
        await fetchExternalBookmarks();
        console.log('Bookmarks preloaded successfully');
      } catch (error) {
        console.error('Failed to preload bookmarks:', error);
      }
    }
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    // Initialize Sentry for the Edge runtime
    Sentry.init({
      dsn: process.env.SENTRY_DSN || "https://f1769f8b48304aabc42fee1425b225d4@o4509274058391557.ingest.us.sentry.io/4509274059309056",
      release: releaseVersion,
      // Adjust this value in production, or use tracesSampler for greater control
      tracesSampleRate: 1.0,
      // Setting this option to true will print useful information to the console while you're setting up Sentry.
      debug: false,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
