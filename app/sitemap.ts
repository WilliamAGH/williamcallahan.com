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
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { kebabCase } from '@/lib/utils/formatters';

// Import data file update timestamps
import { updatedAt as experienceUpdatedAt } from '../data/experience';
import { updatedAt as educationUpdatedAt } from '../data/education';
import { updatedAt as investmentsUpdatedAt } from '../data/investments';
import { updatedAt as projectsUpdatedAt } from '../data/projects';
// Assuming metadata.ts might have its own overall update timestamp, or we use specific PAGE_METADATA dates
import { PAGE_METADATA, metadata as siteMetadata } from '../data/metadata';

// Helper function to safely parse a date string (including simple YYYY-MM-DD)
const getSafeDate = (dateInput: any): Date | undefined => {
  if (!dateInput) return undefined;
  try {
    let dateStr = String(dateInput);
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      // Append time for consistency, assume end of day UTC
      dateStr = `${dateStr}T23:59:59.999Z`;
    }
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date;
    }
  } catch (error) {
    console.error(`Sitemap: Error parsing date: ${dateInput}`, error);
  }
  return undefined;
};

// Helper to get the latest date from a list of potential date objects
const getLatestDate = (...dates: (Date | undefined)[]): Date | undefined => {
  return dates.reduce((latest, current) => {
    if (current && (!latest || current > latest)) {
      return current;
    }
    return latest;
  }, undefined as Date | undefined);
};

// --- Main Sitemap Generation ---
export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = siteMetadata.site.url;
  const postsDirectory = path.join(process.cwd(), 'data/blog/posts');

  // --- 1. Process Blog Posts and Tags ---
  const postsData: { slug: string; lastModified: Date | undefined; tags: string[] }[] = [];
  const tagLastModifiedMap: { [tagSlug: string]: Date } = {};
  let latestPostUpdateTime: Date | undefined = undefined;

  try {
    const filenames = fs.readdirSync(postsDirectory);
    filenames
      .filter((filename) => filename.endsWith('.mdx'))
      .forEach((filename) => {
        const filePath = path.join(postsDirectory, filename);
        let fileMtime: Date | undefined;
        try {
          fileMtime = fs.statSync(filePath).mtime;
        } catch (statError) {
          console.error(`Sitemap: Failed to get mtime for ${filePath}:`, statError);
        }

        const fileContents = fs.readFileSync(filePath, 'utf8');
        const { data } = matter(fileContents);
        const slug = filename.replace(/\.mdx$/, '');

        // Prioritize frontmatter date, fallback to file mtime
        const postLastModified = getLatestDate(
          getSafeDate(data.updatedAt),
          getSafeDate(data.publishedAt),
          fileMtime
        );

        if (!postLastModified) {
          console.warn(`Sitemap: Could not determine lastModified date for post: ${slug}`);
        }

        postsData.push({
          slug,
          lastModified: postLastModified,
          tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
        });

        // Update latest overall post time
        latestPostUpdateTime = getLatestDate(latestPostUpdateTime, postLastModified);

        // Update lastModified time for each tag
        if (postLastModified && Array.isArray(data.tags)) {
          data.tags.forEach((tag: string) => {
            const tagSlug = kebabCase(tag);
            tagLastModifiedMap[tagSlug] = getLatestDate(tagLastModifiedMap[tagSlug], postLastModified) || postLastModified;
          });
        }
      });
  } catch (error) {
    console.error("Sitemap: Error reading blog posts directory:", error);
  }

  // Create blog post sitemap entries
  const blogPostEntries: MetadataRoute.Sitemap = postsData.map(post => ({
    url: `${siteUrl}/blog/${post.slug}`,
    lastModified: post.lastModified,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  // Create blog tag sitemap entries
  const blogTagEntries: MetadataRoute.Sitemap = Object.entries(tagLastModifiedMap).map(([tagSlug, lastModified]) => ({
    url: `${siteUrl}/blog/tags/${tagSlug}`,
    lastModified: lastModified,
    changeFrequency: 'weekly',
    priority: 0.6, // Slightly lower than individual posts
  }));

  // --- 2. Process Static Pages ---
  const staticPages = {
    '/': { priority: 1.0, lastModified: getLatestDate(getPageFileMtime('page.tsx'), getSafeDate(PAGE_METADATA.home.dateModified)) },
    '/experience': { priority: 0.8, lastModified: getSafeDate(experienceUpdatedAt) },
    '/investments': { priority: 0.9, lastModified: getSafeDate(investmentsUpdatedAt) },
    '/education': { priority: 0.7, lastModified: getSafeDate(educationUpdatedAt) }, // Adjusted priority
    '/projects': { priority: 0.9, lastModified: getSafeDate(projectsUpdatedAt) },   // Added projects
    '/bookmarks': { priority: 0.6, lastModified: getLatestDate(getPageFileMtime('bookmarks/page.tsx'), getSafeDate(PAGE_METADATA.bookmarks.dateModified)) }, // Adjusted priority
    '/blog': {
      priority: 0.9,
      lastModified: getLatestDate( // Use latest of blog page mtime, metadata date, or latest post update
        getPageFileMtime('blog/page.tsx'),
        getSafeDate(PAGE_METADATA.blog.dateModified),
        latestPostUpdateTime
      )
    },
  } as const;

  const staticEntries: MetadataRoute.Sitemap = Object.entries(staticPages).map(
    ([route, { priority, lastModified }]) => ({
      url: `${siteUrl}${route}`,
      lastModified: lastModified,
      changeFrequency: 'monthly', // Can adjust per page if needed
      priority,
    })
  );

  // --- 3. Combine and Return ---
  return [...staticEntries, ...blogPostEntries, ...blogTagEntries];
}

// Helper function to get mtime of a specific app page file
const getPageFileMtime = (pagePath: string): Date | undefined => {
  // Ensure path starts within 'app' directory
  const safePagePath = pagePath.startsWith('app/') ? pagePath : `app/${pagePath}`;
  const filePath = path.join(process.cwd(), safePagePath);
  try {
    return fs.statSync(filePath).mtime;
  } catch (statError) {
    // Don't log error if file simply doesn't exist (e.g., for metadata-based dates)
    if ((statError as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`Sitemap: Failed to get mtime for page file ${filePath}:`, statError);
    }
    return undefined;
  }
};
