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

// Configure dynamic rendering
export const dynamic = 'force-dynamic';

import { getStaticPageMetadata } from '../../lib/seo/metadata';
import { JsonLdScript } from "../../components/seo/json-ld";
import { BookmarksServer } from '../../components/features/bookmarks/bookmarks.server';
import type { Metadata } from 'next';

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

/**
 * Generate metadata for the Bookmarks page
 */
export function generateMetadata(): Metadata {
  return getStaticPageMetadata('/bookmarks', 'bookmarks');
}

export default function BookmarksPage() {
  const pageMetadata = PAGE_METADATA.bookmarks;

  return (
    <>
      <JsonLdScript data={jsonLdData} />
      <div className="max-w-5xl mx-auto">
        <BookmarksServer
          title={pageMetadata.title}
          description={pageMetadata.description}
        />
      </div>
    </>
  );
}
