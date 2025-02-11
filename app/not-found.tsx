/**
 * Global Not Found Page
 * @module app/not-found
 * @description
 * Next.js 14 root not-found file for handling all 404 errors.
 * This file must be in the root app directory to be used as the global 404 page.
 *
 * Used for:
 * - Invalid blog tags
 * - Missing blog posts
 * - Non-existent routes
 * - Any other 404 errors across the site
 *
 * @see {@link "https://nextjs.org/docs/app/api-reference/file-conventions/not-found"} - Next.js not-found docs
 */

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
      <h1 className="text-4xl font-bold">Page Not Found</h1>
      <p className="text-lg text-gray-600 dark:text-gray-400">
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <Link
        href="/"
        className="text-blue-600 dark:text-blue-400 hover:underline"
      >
        Back to Home
      </Link>
    </div>
  );
}
