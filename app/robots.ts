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
import { DOMAIN } from "../lib/seo";

/**
 * Generate robots.txt for the application
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
 */
/**
 * Generate robots.txt content
 * @returns {MetadataRoute.Robots} Robots.txt configuration
 *
 * @example
 * Generated robots.txt will look like:
 * ```
 * User-Agent: *
 * Allow: /
 * Disallow: /api/
 *
 * Sitemap: https://williamcallahan.com/sitemap.xml
 * ```
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/'],
    },
    sitemap: `${DOMAIN}/sitemap.xml`,
  };
}
