// This is the error boundary for the 'bookmarks' route
'use client';

import { useEffect } from 'react';
import { formatDate as utilFormatDate } from '@/lib/utils';
import { getErrorTimestamp } from '@/types';

interface ErrorPageProps {
  error: Error;
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  // Log the error for debugging
  useEffect(() => console.error('Error in /bookmarks page:', error), [error]);

  let lastFetched = 0;
  try {
    const match = /^BookmarksUnavailable\|(\d+)/.exec(error.message);
    if (match?.[1]) {
      const parsed = Number(match[1]);
      lastFetched = Number.isFinite(parsed) ? parsed : 0;
    }
  } catch (parseError) {
    console.warn('Failed to parse lastFetched from error message:', parseError);
  }

  // Attempt to get the last fetched timestamp if it was attached to the error
  // (the property name was changed to 'lastFetched' in bookmarks.server.tsx)
  const lastFetchedTimestamp = getErrorTimestamp(error, 'lastFetchedTimestamp');

  return (
    <main className="max-w-5xl mx-auto py-16 px-4 sm:px-6 lg:px-8 text-center">
      <div className="bg-red-50 dark:bg-gray-800 border border-red-200 dark:border-red-700 p-8 rounded-lg shadow-md">
        <h1 className="text-3xl font-bold text-red-600 dark:text-red-400 mb-4">
          😵‍💫 Bookmarks Unavailable
        </h1>
        <p className="text-lg text-gray-700 dark:text-gray-300 mb-6">
          Hmm, my bookmarks service is taking a break.
        </p>
        {lastFetched > 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Last successful fetch: {utilFormatDate(lastFetched)}
          </p>
        )}
        <p className="text-lg text-gray-700 dark:text-gray-300 mb-6">
          Feel free to browse the rest of the site while this gets fixed!
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          We couldn&apos;t load the bookmarks at this time.
          {lastFetchedTimestamp ? (
            ` Last attempt to fetch was at: ${utilFormatDate(lastFetchedTimestamp)}.`
          ) : (
            " It might be a temporary issue, or the data source could be unavailable."
          )}
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-md shadow hover:bg-blue-700 transition"
        >
          Try Again
        </button>
      </div>
    </main>
  );
}
