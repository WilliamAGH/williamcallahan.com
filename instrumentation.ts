import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Initialize Sentry for the Node.js server runtime
    Sentry.init({
      dsn: "https://0042fbb70c614148ae924921ffb9320a@glitchtip.iocloudhost.net/1",
      tracesSampleRate: 1,
      debug: false, // Adjust in production
    });

    // Preload bookmarks into server cache at startup
    if (process.env.NODE_ENV === 'production') {
      try {
        // Dynamic import to avoid issues with Next.js bundling
        const { fetchExternalBookmarks } = await import('./lib/bookmarks');
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
      dsn: "https://0042fbb70c614148ae924921ffb9320a@glitchtip.iocloudhost.net/1",
      tracesSampleRate: 1,
      debug: false, // Adjust in production
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
