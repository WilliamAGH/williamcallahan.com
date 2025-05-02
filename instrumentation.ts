import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
    
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
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
