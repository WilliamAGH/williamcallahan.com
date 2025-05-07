/**
 * Robots.txt Generation
 * @module app/robots
 * @description
 * Generates a robots.txt file for the website using Next.js 14's Metadata API.
 * This file automatically generates a robots.txt file at build time,
 * configuring search engine crawling rules and sitemap location.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
 */

import { MetadataRoute } from 'next';

/**
 * Generate robots.txt for the application
 * Handles different rules for production and non-production environments:
 * - Production: Allow all except /api/ and specific problematic paths, include sitemap
 * - Non-production: All instances other than https://williamcallahan.com, prevent all crawling
 *
 * @returns {MetadataRoute.Robots} Robots.txt configuration
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
 */
export default function robots(): MetadataRoute.Robots {
  const isProd = process.env.NEXT_PUBLIC_SITE_URL === 'https://williamcallahan.com';

  // Define common problematic paths to disallow in production
  const disallowedProdPaths = [
    '/api/',
    '/opt/',
    '/Library/',
    '/Applications/',
    '/bin/',
    '/etc/',
    '/$/', // Match the single dollar sign path
    '/comments/feed/',
    // Add specific old/invalid paths if needed, though redirects might be better
    '/legacy-homepage/',
    '/author/' // Disallow author base
  ];

  return {
    rules: {
      userAgent: '*',
      ...(isProd
        ? {
            allow: '/',
            disallow: disallowedProdPaths
          }
        : {
            disallow: '/'
          }
      ),
    },
    ...(isProd && {
      sitemap: 'https://williamcallahan.com/sitemap.xml'
    }),
  };
}
