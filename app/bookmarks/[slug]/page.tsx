/**
 * Domain-specific Bookmark Page with user-friendly URLs
 * 
 * Displays bookmarks for a specific domain using a clean URL.
 * 
 * @module app/bookmarks/[slug]/page
 */

import { fetchExternalBookmarks } from '@/lib/bookmarks';
import { BookmarksWithOptions } from '@/components/features/bookmarks/bookmarks-with-options.client';
import { JsonLdScript } from '@/components/seo/json-ld';
import { getStaticPageMetadata } from '@/lib/seo/metadata';
import { generateUniqueSlug, slugToDomain } from '@/lib/utils/domain-utils';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

/**
 * Generate static paths for slug pages
 */
export async function generateStaticParams() {
  const bookmarks = await fetchExternalBookmarks();
  return bookmarks.map(bookmark => ({ 
    slug: generateUniqueSlug(bookmark.url, bookmarks, bookmark.id)
  }));
}

/**
 * Generate metadata for this bookmark page
 */
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const path = `/bookmarks/${params.slug}`;
  const baseMetadata = getStaticPageMetadata(path, 'bookmarks');
  
  // Fetch bookmark data to create more specific metadata
  const allBookmarks = await fetchExternalBookmarks();
  const { slug } = params;
  
  // Find the bookmark that matches this slug
  let foundBookmark = null;
  for (const bookmark of allBookmarks) {
    const bookmarkSlug = generateUniqueSlug(bookmark.url, allBookmarks, bookmark.id);
    if (bookmarkSlug === slug) {
      foundBookmark = bookmark;
      break;
    }
  }
  
  // If no bookmark is found, return basic metadata
  if (!foundBookmark) {
    return {
      ...baseMetadata,
      title: `Bookmark | William Callahan`
    };
  }
  
  // Extract domain for display
  let domainName = '';
  try {
    const url = new URL(foundBookmark.url.startsWith('http') ? foundBookmark.url : `https://${foundBookmark.url}`);
    domainName = url.hostname.replace(/^www\./, '');
  } catch {
    domainName = 'website';
  }
  
  // Create custom title and description based on the bookmark
  const customTitle = `${foundBookmark.title || 'Bookmark'} | William Callahan`;
  const customDescription = foundBookmark.description || `A bookmark from ${domainName} that I've saved for future reference.`;
  
  // Create image URL if available
  let imageUrl = foundBookmark.ogImage;
  if (!imageUrl && foundBookmark.content?.imageUrl) {
    imageUrl = foundBookmark.content.imageUrl;
  }
  
  return {
    ...baseMetadata,
    title: customTitle,
    description: customDescription,
    openGraph: {
      ...baseMetadata.openGraph,
      title: customTitle,
      description: customDescription,
      type: 'article',
      url: `https://williamcallahan.com/bookmarks/${slug}`,
      ...(imageUrl && { 
        images: [{ 
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: foundBookmark.title || 'Bookmark image'
        }] 
      })
    },
    twitter: {
      ...baseMetadata.twitter,
      title: customTitle,
      description: customDescription,
      ...(imageUrl && { 
        images: [{ 
          url: imageUrl,
          alt: foundBookmark.title || 'Bookmark image'
        }] 
      })
    },
    alternates: {
      canonical: `https://williamcallahan.com/bookmarks/${slug}`,
    }
  };
}

interface BookmarkPageProps {
  params: { slug: string };
}

export default async function BookmarkPage({ params }: BookmarkPageProps) {
  const allBookmarks = await fetchExternalBookmarks();
  const { slug } = params;
  
  // Find the bookmark that matches this slug
  let foundBookmark = null;
  
  for (const bookmark of allBookmarks) {
    const bookmarkSlug = generateUniqueSlug(bookmark.url, allBookmarks, bookmark.id);
    if (bookmarkSlug === slug) {
      foundBookmark = bookmark;
      break;
    }
  }
  
  // If no bookmark matches this slug, show a 404
  if (!foundBookmark) {
    return notFound();
  }
  
  // Create a collection of related bookmarks from the same domain
  let domainBookmarks = allBookmarks.filter(b => {
    try {
      const bookmarkUrl = new URL(b.url.startsWith('http') ? b.url : `https://${b.url}`);
      const foundBookmarkUrl = new URL(
        foundBookmark.url.startsWith('http') ? foundBookmark.url : `https://${foundBookmark.url}`
      );
      return bookmarkUrl.hostname === foundBookmarkUrl.hostname;
    } catch {
      return false;
    }
  });
  
  // Use consistent header with main bookmarks page
  const pageTitle = 'Bookmarks';
  const pageDescription = 'A collection of articles, websites, and resources I\'ve bookmarked for future reference.';
  
  // Extract domain for display purposes (still needed for JSON-LD)
  let domainName = '';
  try {
    const url = new URL(foundBookmark.url.startsWith('http') ? foundBookmark.url : `https://${foundBookmark.url}`);
    domainName = url.hostname.replace(/^www\./, '');
  } catch {
    domainName = 'website';
  }
  
  // Create enhanced JSON-LD data for better SEO
  const jsonLdData = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": foundBookmark.title || 'Bookmark',
    "description": foundBookmark.description || `A bookmark from ${domainName}`,
    "url": `https://williamcallahan.com/bookmarks/${slug}`,
    "mainEntity": {
      "@type": "WebPage",
      "name": foundBookmark.title,
      "url": foundBookmark.url,
      "description": foundBookmark.description,
      "publisher": {
        "@type": "Organization",
        "name": domainName,
        "url": `https://${domainName}`
      }
    },
    "author": {
      "@type": "Person",
      "name": "William Callahan",
      "url": "https://williamcallahan.com"
    },
    "datePublished": foundBookmark.dateBookmarked || new Date().toISOString()
  };

  return (
    <>
      <JsonLdScript data={jsonLdData} />
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">{pageTitle}</h1>
        <p className="text-gray-600 dark:text-gray-300 mb-8">{pageDescription}</p>
        
        {/* Show the bookmark and related bookmarks from the same domain */}
        <BookmarksWithOptions 
          bookmarks={domainBookmarks} 
          showFilterBar={false} 
          searchAllBookmarks={true} 
        />
      </div>
    </>
  );
}