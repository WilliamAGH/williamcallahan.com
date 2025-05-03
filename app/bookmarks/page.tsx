/**
 * Bookmarks Page
 * @module app/bookmarks/page
 * @description
 * Displays curated collection of bookmarked resources
 * Implements proper SEO with schema.org structured data
 *
 * @see {@link "https://nextjs.org/docs/app/api-reference/functions/generate-metadata"} - Next.js Metadata API
 * @see {@link "https://schema.org/CollectionPage"} - Schema.org CollectionPage specification
 */

import { Suspense } from 'react';
import { BookmarksClient } from '@/components/features/bookmarks/bookmarks.client';
import { getStaticPageMetadata } from '../../lib/seo/metadata';
import { JsonLdScript } from "../../components/seo/json-ld";
import type { Metadata } from 'next';
import type { UnifiedBookmark } from '@/types';
import { fetchExternalBookmarks } from '@/lib/bookmarks';

/**
 * Page Metadata
 * Used for SEO and JSON-LD data
 */
const PAGE_METADATA = {
  bookmarks: {
    title: 'Bookmarks',
    description: 'A collection of articles, websites, and resources I\'ve bookmarked for future reference.',
    path: '/bookmarks',
  },
};

/**
 * JSON-LD Data for the page
 */
const jsonLdData = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "name": PAGE_METADATA.bookmarks.title,
  "description": PAGE_METADATA.bookmarks.description
};

// This will show while the bookmarks are loading
export function BookmarksLoading() {
  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 space-y-6">
        <div className="w-full h-12 rounded-xl bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
        <div className="flex gap-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-9 w-20 rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="rounded-xl overflow-hidden">
            <div className="w-full aspect-video bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
            <div className="p-5 space-y-4 bg-white dark:bg-gray-800">
              <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse"></div>
              <div className="h-6 w-3/4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
              <div className="space-y-2">
                <div className="h-3 w-full bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                <div className="h-3 w-5/6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
              </div>
              <div className="pt-4 flex gap-1.5">
                {[1, 2, 3].map(j => (
                  <div key={j} className="h-5 w-16 rounded-md bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Generate metadata for the Bookmarks page
 */
export function generateMetadata(): Metadata {
  return getStaticPageMetadata('/bookmarks', 'bookmarks');
}

export default async function BookmarksPage() {
  // Fetch bookmarks with error handling
  let bookmarks: UnifiedBookmark[] = [];
  try {
    bookmarks = await fetchExternalBookmarks();
    console.log('Server-side bookmarks count:', bookmarks.length);
    if (bookmarks.length > 0) {
      console.log('First bookmark title:', bookmarks[0]?.title);
    } else {
      console.warn('No bookmarks found in server-side rendering');
    }
  } catch (error) {
    console.error('Error fetching bookmarks in server-side rendering:', error);
    // Continue with empty bookmarks array
  }

  const pageMetadata = PAGE_METADATA.bookmarks;

  // Sort bookmarks by date (newest first) if we have any
  const sortedBookmarks: UnifiedBookmark[] = bookmarks.length ? 
    [...bookmarks].sort((a, b) => {
      const dateA = a.dateBookmarked ? new Date(a.dateBookmarked).getTime() : 0;
      const dateB = b.dateBookmarked ? new Date(b.dateBookmarked).getTime() : 0;
      return dateB - dateA;
    }) : [];

  return (
    <>
      <JsonLdScript data={jsonLdData} />
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">{pageMetadata.title}</h1>
        <p className="text-gray-600 dark:text-gray-300 mb-8">{pageMetadata.description}</p>
        <Suspense fallback={<BookmarksLoading />}>
          {/* Force client-side fetching to ensure data appears */}
          <BookmarksClient bookmarks={sortedBookmarks} forceClientFetch={true} />
        </Suspense>
      </div>
    </>
  );
}
