/**
 * Bookmarks Tag Page
 *
 * Displays all bookmarks tagged with a specific tag.
 *
 * @module app/bookmarks/tags/[tagSlug]/page
 */

// Configure dynamic rendering
export const dynamic = 'force-dynamic';

import { fetchExternalBookmarks } from '@/lib/bookmarks';
import { BookmarksWithOptions } from '@/components/features/bookmarks/bookmarks-with-options.client';
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
export async function generateMetadata({ params }: { params: { tagSlug: string }}): Promise<Metadata> {
  // Make sure to await the params object
  const paramsResolved = await Promise.resolve(params);
  const tagSlug = paramsResolved.tagSlug;
  const tagQuery = tagSlug.replace(/-/g, ' ');
  
  // Try to find the original tag capitalization
  const allBookmarks = await fetchExternalBookmarks();
  let displayTag = tagQuery.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  
  // Look for the exact tag in bookmarks to get proper capitalization
  for (const bookmark of allBookmarks) {
    const tags = (Array.isArray(bookmark.tags) ? bookmark.tags : []);
    for (const t of tags) {
      const tagName = typeof t === 'string' ? t : t.name;
      if (tagName.toLowerCase() === tagQuery.toLowerCase()) {
        if (/[A-Z]/.test(tagName.slice(1))) {
          displayTag = tagName; // Keep original mixed case (like iPhone)
        }
        break;
      }
    }
  }
  
  // Base metadata with custom title
  const path = `/bookmarks/tags/${params.tagSlug}`;
  const baseMetadata = getStaticPageMetadata(path, 'bookmarks');
  
  // Override title and description with tag-specific values
  const customTitle = `${displayTag} Bookmarks | William Callahan`;
  const customDescription = `A collection of articles, websites, and resources I've saved about ${displayTag.toLowerCase()} for future reference.`;
  
  return {
    ...baseMetadata,
    title: customTitle,
    description: customDescription,
    openGraph: {
      ...baseMetadata.openGraph,
      title: customTitle,
      description: customDescription,
      type: 'website',
      url: `https://williamcallahan.com/bookmarks/tags/${params.tagSlug}`,
    },
    twitter: {
      ...baseMetadata.twitter,
      title: customTitle,
      description: customDescription,
    },
    alternates: {
      canonical: `https://williamcallahan.com/bookmarks/tags/${params.tagSlug}`,
    }
  };
}

interface TagPageProps {
  params: { tagSlug: string };
}

export default async function TagPage({ params }: TagPageProps) {
  const allBookmarks = await fetchExternalBookmarks();
  // Make sure to await the params object
  const paramsResolved = await Promise.resolve(params);
  const tagSlug = paramsResolved.tagSlug;
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

  // Custom title and description for the tag page
  const pageTitle = `${displayTag} Bookmarks`;
  const pageDescription = `A collection of articles, websites, and resources I've saved about ${displayTag.toLowerCase()} for future reference.`;
  
  // Update JSON-LD data with tag-specific information
  const jsonLdData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": pageTitle,
    "description": pageDescription
  };

  return (
    <>
      <JsonLdScript data={jsonLdData} />
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">{pageTitle}</h1>
        <p className="text-gray-600 dark:text-gray-300 mb-8">{pageDescription}</p>
        <BookmarksWithOptions 
          bookmarks={filtered} 
          showFilterBar={true} 
          searchAllBookmarks={true} 
        />
      </div>
    </>
  );
}