/**
 * Sitemap Generation
 * @module app/sitemap
 * @description
 * Generates a sitemap for the website using Next.js 14's Metadata API.
 * This file automatically generates a sitemap.xml file at build time,
 * including all static pages and dynamic blog posts.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
 */

import { MetadataRoute } from 'next';
import { getAllPosts } from "../lib/blog";
import { DOMAIN } from "../lib/seo";

/**
 * Generate sitemap for the application
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
 */
/**
 * Generate sitemap entries
 * @returns {Promise<MetadataRoute.Sitemap>} Array of sitemap entries
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Get all blog posts
  const posts = await getAllPosts();

  // Static pages
  const staticPages = [
    {
      url: DOMAIN,
      lastModified: new Date(),
    },
    {
      url: `${DOMAIN}/blog`,
      lastModified: new Date(),
    },
    {
      url: `${DOMAIN}/experience`,
      lastModified: new Date(),
    },
    {
      url: `${DOMAIN}/education`,
      lastModified: new Date(),
    },
    {
      url: `${DOMAIN}/investments`,
      lastModified: new Date(),
    },
  ];

  // Blog post pages
  const blogPages = posts.map((post) => ({
    url: `${DOMAIN}/blog/${post.slug}`,
    lastModified: new Date(post.updatedAt || post.publishedAt),
  }));

  return [...staticPages, ...blogPages];
}
