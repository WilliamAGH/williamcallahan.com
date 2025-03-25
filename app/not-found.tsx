/**
 * Custom 404 Not Found Page
 * @module app/not-found
 * @description
 * Provides a user-friendly 404 page with animated elements when content is not found.
 * This is automatically used by Next.js when the `notFound()` function is called.
 *
 * @see {@link app/blog/[slug]/page.tsx} - Example of notFound() usage
 * @see {@link app/global-error.tsx} - Global error handling for server errors
 * @see {@link https://nextjs.org/docs/app/api-reference/functions/not-found} - Next.js notFound() documentation
 */

"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";

export default function NotFound() {
  // Animation state for the glitch effect
  const [glitchClass, setGlitchClass] = useState("");

  // Randomize glitch effect periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setGlitchClass("animate-glitch");
      setTimeout(() => setGlitchClass(""), 500);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-4xl mx-auto flex flex-col items-center justify-center min-h-[70vh] text-center px-4">
      <div className="relative">
        <h1
          className={`text-9xl font-bold tracking-tighter ${glitchClass}`}
          data-text="404"
        >
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400">
            404
          </span>
        </h1>

        {/* Decorative elements */}
        <div className="absolute -top-4 -right-4 w-8 h-8 border-t-2 border-r-2 border-blue-500 dark:border-blue-400 opacity-75" />
        <div className="absolute -bottom-4 -left-4 w-8 h-8 border-b-2 border-l-2 border-purple-500 dark:border-purple-400 opacity-75" />
      </div>

      <h2 className="mt-6 text-3xl font-semibold tracking-tight text-gray-800 dark:text-gray-200">
        Page not found
      </h2>

      <p className="mt-4 text-xl text-gray-600 dark:text-gray-400 max-w-lg">
        The page you&apos;re looking for doesn&apos;t exist or has been moved to another URL.
      </p>

      <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
        <Link
          href="/"
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-500 dark:to-purple-500 text-white rounded-lg font-medium transform transition duration-200 hover:translate-y-[-2px] hover:shadow-lg"
        >
          <ArrowLeft size={20} />
          Back to Home
        </Link>

        <Link
          href="/blog"
          className="px-6 py-3 border border-gray-300 dark:border-gray-700 rounded-lg font-medium text-gray-800 dark:text-gray-200 transition-colors duration-200 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          Browse Articles
        </Link>
      </div>

      <div className="mt-16 text-sm text-gray-500 dark:text-gray-500">
        If you believe this is an error, please contact{" "}
        <a
          href="mailto:support@williamcallahan.com"
          className="text-blue-600 dark:text-blue-400 hover:underline"
        >
          support
        </a>
      </div>
    </div>
  );
}
