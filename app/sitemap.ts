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
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

// Helper function to safely get date from frontmatter
const getSafeDate = (dateInput: any): Date | undefined => {
  if (!dateInput) return undefined;
  try {
    const date = new Date(dateInput);
    // Check if the date is valid
    if (!isNaN(date.getTime())) {
      return date;
    }
  } catch (error) {
    console.error(`Error parsing date: ${dateInput}`, error);
  }
  return undefined;
};

/**
 * Generate sitemap entries for all static and dynamic pages
 * @returns {MetadataRoute.Sitemap} Sitemap entries following Next.js format
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = siteMetadata.site.url;

  // Helper function to get mtime of a specific data file
  const getDataFileMtime = (filename: string): Date | undefined => {
    const filePath = path.join(process.cwd(), 'data', filename);
    try {
      return fs.statSync(filePath).mtime;
    } catch (statError) {
      console.error(`Failed to get mtime for data file ${filePath}:`, statError);
      return undefined;
    }
  };

  // Helper function to get mtime of a specific app page file
  const getPageFileMtime = (pagePath: string): Date | undefined => {
    const filePath = path.join(process.cwd(), 'app', pagePath);
    try {
      return fs.statSync(filePath).mtime;
    } catch (statError) {
      console.error(`Failed to get mtime for page file ${filePath}:`, statError);
      return undefined;
    }
  };

  // --- Dynamic Blog Posts (Process First to get latest date for /blog) ---
  const postsDirectory = path.join(process.cwd(), 'data/blog/posts');
  let blogEntries: MetadataRoute.Sitemap = [];
  let latestBlogPostDate: Date | undefined = undefined;

  try {
    const filenames = fs.readdirSync(postsDirectory);

    blogEntries = filenames
      .filter((filename) => filename.endsWith('.mdx'))
      .map((filename) => {
        const filePath = path.join(postsDirectory, filename);
        const fileContents = fs.readFileSync(filePath, 'utf8');
        const { data } = matter(fileContents);
        const slug = filename.replace(/\.mdx$/, '');
        // Prioritize updatedAt, then publishedAt from frontmatter
        let postLastModifiedDate = getSafeDate(data.updatedAt || data.publishedAt);

        // Fallback to file system mtime if frontmatter dates are missing/invalid
        if (!postLastModifiedDate) {
          try {
            postLastModifiedDate = fs.statSync(filePath).mtime;
            // Add a console warning if falling back to mtime? Optional.
            // console.warn(`Falling back to mtime for blog post: ${slug}`);
          } catch (statError) {
            console.error(`Failed to get mtime for blog post ${filePath}:`, statError);
          }
        }

        // Track the latest modification date among all posts
        if (postLastModifiedDate) {
          if (!latestBlogPostDate || postLastModifiedDate > latestBlogPostDate) {
            latestBlogPostDate = postLastModifiedDate;
          }
        }

        const entry: MetadataRoute.Sitemap[number] = {
          url: `${siteUrl}/blog/${slug}`,
          changeFrequency: 'weekly',
          priority: 0.7,
        };

        if (postLastModifiedDate) {
          entry.lastModified = postLastModifiedDate;
        }
        return entry;
      })
      .filter(Boolean) as MetadataRoute.Sitemap;

  } catch (error) {
    console.error("Error reading blog posts directory for sitemap:", error);
  }

  // --- Static Pages ---
  const staticRoutesMap = {
    '/': 1.0,
    '/blog': 0.9,
    '/experience': 0.8,
    '/investments': 0.8,
    '/education': 0.5,
    '/bookmarks': 0.7,
  } as const;

  const staticEntries = Object.entries(staticRoutesMap).map(([route, priority]) => {
    const key = route === '/' ? 'home' : (route.slice(1) as keyof typeof PAGE_METADATA);
    const pageMetadata = PAGE_METADATA[key];
    let lastModifiedDate: Date | undefined;

    switch (key) {
      case 'home':
        // Prioritize page file mtime, fallback to metadata dates
        lastModifiedDate = getPageFileMtime('page.tsx'); // Assuming app/page.tsx
        if (!lastModifiedDate) {
          lastModifiedDate = getSafeDate(pageMetadata.dateModified);
          if (!lastModifiedDate) {
            lastModifiedDate = getSafeDate(pageMetadata.dateCreated);
          }
        }
        break;
      case 'experience':
      case 'investments':
      case 'education':
        lastModifiedDate = getDataFileMtime(`${key}.ts`);
        break;
      case 'blog':
        // Use the latest blog post date if available and newer
        const blogMetadataDate = getSafeDate(pageMetadata.dateModified) || getSafeDate(pageMetadata.dateCreated);
        if (latestBlogPostDate && (!blogMetadataDate || latestBlogPostDate > blogMetadataDate)) {
          lastModifiedDate = latestBlogPostDate;
        } else {
          lastModifiedDate = blogMetadataDate;
        }
        break;
      default: // bookmarks
        lastModifiedDate = getSafeDate(pageMetadata.dateModified);
        if (!lastModifiedDate) {
          lastModifiedDate = getSafeDate(pageMetadata.dateCreated);
        }
        break;
    }

    const entry: MetadataRoute.Sitemap[number] = {
      url: `${siteUrl}${route}`,
      changeFrequency: 'monthly',
      priority,
    };

    if (lastModifiedDate) {
      entry.lastModified = lastModifiedDate;
    }
    return entry;
  });

  // --- Combine ---
  return [...staticEntries, ...blogEntries];
}
