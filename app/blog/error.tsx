
/**
 * Blog Error Page
 *
 * This page is used to catch errors within the blog route and show a more user-friendly error message
 * instead of crashing the entire application
 */

"use client";

import { useEffect } from 'react';
import * as Sentry from "@sentry/nextjs";
import Link from 'next/link';

/**
 * Blog-specific error page
 * Catches errors within the blog route and shows a more user-friendly error message
 * instead of crashing the entire application
 */
export default function BlogError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to Sentry
    Sentry.captureException(error);

    // Log to console in development
    if (process.env.NODE_ENV !== 'production') {
      console.error('Blog Error:', error);
    }
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 shadow-lg rounded-lg p-8 border border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-bold mb-4 text-red-600 dark:text-red-400">
          Unable to load blog content
        </h2>

        <p className="text-gray-700 dark:text-gray-300 mb-6">
          We encountered an issue while loading this blog post. Our team has been notified and we&apos;ll fix it as soon as possible.
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={reset}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors"
          >
            Try again
          </button>

          <Link
            href="/blog"
            className="text-center bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-medium py-2 px-4 rounded transition-colors"
          >
            Go to Blog Home
          </Link>
        </div>
      </div>
    </div>
  );
}