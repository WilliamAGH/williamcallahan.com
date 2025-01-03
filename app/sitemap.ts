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
import { API_BASE_URL } from "../lib/constants";

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
      url: API_BASE_URL,
      lastModified: new Date(),
    },
    {
      url: `${API_BASE_URL}/blog`,
      lastModified: new Date(),
    },
    {
      url: `${API_BASE_URL}/experience`,
      lastModified: new Date(),
    },
    {
      url: `${API_BASE_URL}/education`,
      lastModified: new Date(),
    },
    {
      url: `${API_BASE_URL}/investments`,
      lastModified: new Date(),
    },
  ];

  // Blog post pages
  const blogPages = posts.map((post) => ({
    url: `${API_BASE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.updatedAt || post.publishedAt),
  }));

  return [...staticPages, ...blogPages];
}
