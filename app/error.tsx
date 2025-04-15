"use client";

import { useEffect } from 'react';
import * as Sentry from "@sentry/nextjs";
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Global error handler for the entire application
 * Catches errors across all routes while providing
 * minimal UI disruption
 */
export default function GlobalAppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const isBlogRoute = pathname?.startsWith('/blog');

  useEffect(() => {
    // Log the error to Sentry with route information
    Sentry.captureException(error, {
      tags: { route: pathname || 'unknown' }
    });

    // Log to console in development only
    if (process.env.NODE_ENV !== 'production') {
      console.error(`Error on route "${pathname}":`, error);
    }
  }, [error, pathname]);

  // Simplified, unobtrusive error UI for all viewports
  return (
    <div className="w-full max-w-6xl mx-auto">
      <div className="my-4 p-2">
        <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
          <button
            onClick={reset}
            className="text-sm bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-3 py-1 rounded-md transition-colors"
          >
            Refresh
          </button>

          {isBlogRoute && (
            <Link
              href="/blog"
              className="text-sm bg-gray-50 hover:bg-gray-100 dark:bg-gray-800/40 dark:hover:bg-gray-800/60 text-gray-600 dark:text-gray-400 px-3 py-1 rounded-md transition-colors"
            >
              Blog Home
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}