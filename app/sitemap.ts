/**
 * Sitemap Generation
 * @module app/sitemap
 * @description
 * Generates sitemap.xml for the site following Next.js 14 conventions.
 * Includes all static pages and their metadata.
 *
 * @see {@link "https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap"} - Next.js Sitemap API
 * @see {@link "../data/metadata.ts"} - Source of page metadata including dates
 */

import { MetadataRoute } from 'next';
import { PAGE_METADATA, metadata as siteMetadata } from '../data/metadata';

/**
 * Generate sitemap entries for all static pages
 * @returns {MetadataRoute.Sitemap} Sitemap entries following Next.js format
 */
export default function sitemap(): MetadataRoute.Sitemap {
  // Map of routes to their priorities
  const routes = {
    '/': 1.0,
    '/blog': 0.9,
    '/experience': 0.8,
    '/investments': 0.8,
    '/education': 0.5,
    '/bookmarks': 0.7,
  } as const;

  // Create sitemap entries for each route
  return Object.entries(routes).map(([route, priority]) => {
    const key = route === '/' ? 'home' : route.slice(1);
    const pageMetadata = PAGE_METADATA[key as keyof typeof PAGE_METADATA];

    return {
      url: `${siteMetadata.site.url}${route}`,
      lastModified: pageMetadata.dateModified,
      changeFrequency: 'monthly',
      priority,
    };
  });
}
