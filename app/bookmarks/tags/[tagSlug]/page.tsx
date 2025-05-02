/**
 * Bookmarks Tag Page
 *
 * Displays all bookmarks tagged with a specific tag.
 *
 * @module app/bookmarks/tags/[tagSlug]/page
 */

import { fetchExternalBookmarks } from '@/lib/bookmarks';
import { BookmarksClient } from '@/components/features/bookmarks/bookmarks.client';
import { JsonLdScript } from '@/components/seo/json-ld';
import { getStaticPageMetadata } from '@/lib/seo/metadata';
import type { Metadata } from 'next';

/**
 * Generate static paths for tag pages
 */
export async function generateStaticParams() {
  const bookmarks = await fetchExternalBookmarks();
  const tags = bookmarks.flatMap(b =>
    (Array.isArray(b.tags) ? b.tags : []).map(t => (typeof t === 'string' ? t : t.name))
  );
  const uniqueSlugs = Array.from(new Set(tags)).map(tag =>
    tag.toLowerCase().replace(/\s+/g, '-')
  );
  return uniqueSlugs.map(tagSlug => ({ tagSlug }));
}

/**
 * Generate metadata for this tag page
 */
export function generateMetadata({ params }: { params: { tagSlug: string }}): Metadata {
  const path = `/bookmarks/tags/${params.tagSlug}`;
  return getStaticPageMetadata(path, 'bookmarks');
}

interface TagPageProps {
  params: { tagSlug: string };
}

export default async function TagPage({ params }: TagPageProps) {
  const allBookmarks = await fetchExternalBookmarks();
  const tagSlug = params.tagSlug;
  const tagQuery = tagSlug.replace(/-/g, ' ');
  
  const filtered = allBookmarks.filter(b => {
    const names = (Array.isArray(b.tags) ? b.tags : []).map(t =>
      typeof t === 'string' ? t : t.name
    );
    return names.some(n => n.toLowerCase() === tagQuery.toLowerCase());
  });
  
  // Find the original tag with proper capitalization
  let displayTag = tagQuery;
  if (filtered.length > 0) {
    // Loop through filtered bookmarks to find the original tag format
    for (const bookmark of filtered) {
      const tags = (Array.isArray(bookmark.tags) ? bookmark.tags : []);
      for (const t of tags) {
        const tagName = typeof t === 'string' ? t : t.name;
        if (tagName.toLowerCase() === tagQuery.toLowerCase()) {
          // Format the tag: preserve if mixed-case (like aVenture or iPhone)
          if (/[A-Z]/.test(tagName.slice(1))) {
            displayTag = tagName;
          } else {
            // Title case otherwise
            displayTag = tagQuery
              .split(/[\s-]+/)
              .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
              .join(' ');
          }
          break;
        }
      }
    }
  }

  const jsonLdData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": `Bookmarks tagged ${displayTag}`,
    "description": `All bookmarks tagged with ${displayTag}`
  };

  return (
    <>
      <JsonLdScript data={jsonLdData} />
      <div className="container mx-auto p-8">
        <h1 className="text-3xl font-bold mb-6">{`Bookmarks tagged ${displayTag}`}</h1>
        <BookmarksClient bookmarks={filtered} />
      </div>
    </>
  );
}