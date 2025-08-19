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

import fs from "node:fs";
import path from "node:path";
import { getBookmarksForStaticBuildAsync } from "../lib/bookmarks/bookmarks.server";
import { loadSlugMapping, getSlugForBookmark } from "../lib/bookmarks/slug-manager";
import { kebabCase } from "../lib/utils/formatters";
import { tagToSlug } from "../lib/utils/tag-utils";
import matter from "gray-matter";
import type { MetadataRoute } from "next";
import { BOOKMARKS_PER_PAGE } from "../lib/constants";

import { updatedAt as educationUpdatedAt } from "../data/education";
// Import data file update timestamps
import { updatedAt as experienceUpdatedAt } from "../data/experience";
import { updatedAt as investmentsUpdatedAt } from "../data/investments";
// Assuming metadata.ts might have its own overall update timestamp, or we use specific PAGE_METADATA dates
import { PAGE_METADATA, metadata as siteMetadata } from "../data/metadata";
import { updatedAt as projectsUpdatedAt, projects } from "../data/projects";

// Helper function to safely parse a date string (including simple YYYY-MM-DD)
const getSafeDate = (dateInput: string | Date | number | undefined | null): Date | undefined => {
  if (!dateInput) return undefined;
  try {
    let dateStr = String(dateInput);
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      // Append time for consistency, assume end of day UTC
      dateStr = `${dateStr}T23:59:59.999Z`;
    }
    const date = new Date(dateStr);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  } catch (error) {
    console.error(`Sitemap: Error parsing date: ${String(dateInput)}`, error);
  }
  return undefined;
};

// Helper to get the latest date from a list of potential date objects
const getLatestDate = (...dates: (Date | undefined)[]): Date | undefined => {
  return dates.reduce(
    (latest, current) => {
      if (current && (!latest || current > latest)) {
        return current;
      }
      return latest;
    },
    undefined as Date | undefined,
  );
};

// --- Main Sitemap Generation ---
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = siteMetadata.site.url;
  const postsDirectory = path.join(process.cwd(), "data/blog/posts");

  // --- 1. Process Blog Posts and Tags ---
  const postsData: { slug: string; lastModified: Date | undefined; tags: string[] }[] = [];
  const tagLastModifiedMap: { [tagSlug: string]: Date } = {};
  let latestPostUpdateTime: Date | undefined;

  try {
    const filenames = fs.readdirSync(postsDirectory);
    const mdxFiles = filenames.filter((filename) => filename.endsWith(".mdx"));
    for (const filename of mdxFiles) {
      const filePath = path.join(postsDirectory, filename);
      let fileMtime: Date | undefined;
      try {
        fileMtime = fs.statSync(filePath).mtime;
      } catch (statError) {
        console.error(`Sitemap: Failed to get mtime for ${filePath}:`, statError);
      }

      const fileContents = fs.readFileSync(filePath, "utf8");
      const { data } = matter(fileContents);
      const slug = filename.replace(/\.mdx$/, "");

      // Prioritize frontmatter date, fallback to file mtime
      const postLastModified = getLatestDate(
        getSafeDate(data.updatedAt as string | Date | number | undefined | null),
        getSafeDate(data.publishedAt as string | Date | number | undefined | null),
        fileMtime,
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
        for (const tag of data.tags as string[]) {
          const tagSlug = kebabCase(tag);
          tagLastModifiedMap[tagSlug] =
            getLatestDate(tagLastModifiedMap[tagSlug], postLastModified) || postLastModified;
        }
      }
    }
  } catch (error) {
    console.error("Sitemap: Error reading blog posts directory:", error);
  }

  // Create blog post sitemap entries
  const blogPostEntries: MetadataRoute.Sitemap = postsData.map((post) => ({
    url: `${siteUrl}/blog/${post.slug}`,
    lastModified: post.lastModified,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  // Create blog tag sitemap entries
  const blogTagEntries: MetadataRoute.Sitemap = Object.entries(tagLastModifiedMap).map(([tagSlug, lastModified]) => ({
    url: `${siteUrl}/blog/tags/${tagSlug}`,
    lastModified: lastModified,
    changeFrequency: "weekly",
    priority: 0.6, // Slightly lower than individual posts
  }));

  // --- 2. Process Bookmarks and Bookmark Tags ---
  const bookmarkEntries: MetadataRoute.Sitemap = [];
  const paginatedBookmarkEntries: MetadataRoute.Sitemap = [];
  let bookmarkTagEntries: MetadataRoute.Sitemap = [];
  const paginatedBookmarkTagEntries: MetadataRoute.Sitemap = [];
  let latestBookmarkUpdateTime: Date | undefined;
  const bookmarkTagLastModifiedMap: { [tagSlug: string]: Date } = {};
  const bookmarkTagCounts: { [tagSlug: string]: number } = {};

  try {
    // Use async static build function to get bookmarks with slugs
    console.log("[Sitemap] Getting bookmarks for static build...");
    const bookmarks = await getBookmarksForStaticBuildAsync();
    console.log(`[Sitemap] Successfully got ${bookmarks.length} bookmarks with slugs for sitemap generation.`);

    // Load slug mapping – preferred for individual bookmark routes. If unavailable,
    // generate one dynamically to ensure all bookmark routes are included.
    console.log("[Sitemap] Loading slug mapping...");
    let slugMapping = await loadSlugMapping();
    if (!slugMapping || Object.keys(slugMapping.slugs).length === 0) {
      console.warn(
        "[Sitemap] WARNING: No valid slug mapping found – generating dynamically to ensure all bookmark routes are included.",
      );
      // Generate slug mapping dynamically from the bookmarks we already have
      const { generateSlugMapping } = await import("../lib/bookmarks/slug-manager");
      slugMapping = generateSlugMapping(bookmarks);
      console.log(`[Sitemap] Dynamically generated slug mapping with ${slugMapping.count} entries`);
    } else {
      console.log(`[Sitemap] Loaded slug mapping with ${slugMapping.count} entries`);
    }

    // Process each bookmark for individual pages
    for (const bookmark of bookmarks) {
      // Use the bookmark's creation or modification date
      const bookmarkLastModified = getSafeDate(bookmark.modifiedAt || bookmark.dateCreated || bookmark.dateBookmarked);
      if (bookmarkLastModified) {
        // Update latest overall bookmark time
        latestBookmarkUpdateTime = getLatestDate(latestBookmarkUpdateTime, bookmarkLastModified);
      }

      // Add individual bookmark entry only if we have a slug mapping
      if (slugMapping) {
        const slug = getSlugForBookmark(slugMapping, bookmark.id);
        if (!slug) {
          console.error(`[Sitemap] CRITICAL: No slug found for bookmark ${bookmark.id}, skipping individual URL`);
        } else {
          bookmarkEntries.push({
            url: `${siteUrl}/bookmarks/${slug}`,
            lastModified: bookmarkLastModified,
            changeFrequency: "weekly",
            priority: 0.65, // Same priority level as blog posts
          });
        }
      }

      // Process tags for this bookmark
      const tags = Array.isArray(bookmark.tags)
        ? bookmark.tags.map((t: string | import("../types").BookmarkTag) => (typeof t === "string" ? t : t.name))
        : [];

      // Update lastModified time and count for each tag
      if (tags.length > 0) {
        for (const tag of tags) {
          const tagSlug = tagToSlug(tag);

          // Update count
          bookmarkTagCounts[tagSlug] = (bookmarkTagCounts[tagSlug] || 0) + 1;

          // Update lastModified
          if (bookmarkLastModified) {
            bookmarkTagLastModifiedMap[tagSlug] =
              getLatestDate(bookmarkTagLastModifiedMap[tagSlug], bookmarkLastModified) || bookmarkLastModified;
          }
        }
      }
    }

    // Generate paginated bookmark list entries
    const totalBookmarkPages = Math.ceil(bookmarks.length / BOOKMARKS_PER_PAGE);

    // Add paginated bookmark list pages (skip page 1 as it's the main /bookmarks route)
    for (let page = 2; page <= totalBookmarkPages; page++) {
      const entry: MetadataRoute.Sitemap[number] = {
        url: `${siteUrl}/bookmarks/page/${page}`,
        changeFrequency: "weekly",
        priority: 0.65, // Same priority as individual bookmarks
      };

      // Only add lastModified if we have a valid date
      if (latestBookmarkUpdateTime) {
        entry.lastModified = latestBookmarkUpdateTime;
      }

      paginatedBookmarkEntries.push(entry);
    }

    // Create bookmark tag sitemap entries
    bookmarkTagEntries = Object.entries(bookmarkTagLastModifiedMap).map(([tagSlug, lastModified]) => ({
      // Strip any remaining unicode control characters using a safe approach
      url: `${siteUrl}/bookmarks/tags/${tagSlug.replace(/[^\u0020-\u007E]/g, "")}`, // Keep only printable ASCII
      lastModified: lastModified,
      changeFrequency: "weekly",
      priority: 0.6, // Same priority as blog tags
    }));

    // Generate paginated bookmark tag entries
    for (const [tagSlug, count] of Object.entries(bookmarkTagCounts)) {
      const totalPages = Math.ceil(count / BOOKMARKS_PER_PAGE);

      // Add paginated tag pages (skip page 1 as it's the main tag route)
      for (let page = 2; page <= totalPages; page++) {
        const entry: MetadataRoute.Sitemap[number] = {
          url: `${siteUrl}/bookmarks/tags/${tagSlug.replace(/[^\u0020-\u007E]/g, "")}/page/${page}`,
          changeFrequency: "weekly",
          priority: 0.55, // Slightly lower than main tag page
        };

        // Add lastModified if available
        if (bookmarkTagLastModifiedMap[tagSlug]) {
          entry.lastModified = bookmarkTagLastModifiedMap[tagSlug];
        }

        paginatedBookmarkTagEntries.push(entry);
      }
    }
  } catch (error) {
    console.error("Sitemap: Error processing bookmarks:", error);
  }

  // --- 3. Process Static Pages ---
  const staticPages = {
    "/": {
      priority: 1.0,
      lastModified: getLatestDate(getPageFileMtime("page.tsx"), getSafeDate(PAGE_METADATA.home.dateModified)),
    },
    "/experience": { priority: 0.8, lastModified: getSafeDate(experienceUpdatedAt) },
    "/investments": { priority: 0.9, lastModified: getSafeDate(investmentsUpdatedAt) },
    "/education": { priority: 0.7, lastModified: getSafeDate(educationUpdatedAt) }, // Adjusted priority
    "/projects": { priority: 0.9, lastModified: getSafeDate(projectsUpdatedAt) }, // Added projects
    "/bookmarks": {
      priority: 0.7,
      lastModified: getLatestDate(
        getPageFileMtime("bookmarks/page.tsx"),
        getSafeDate(PAGE_METADATA.bookmarks?.dateModified),
        latestBookmarkUpdateTime,
      ),
    },
    "/blog": {
      priority: 0.9,
      lastModified: getLatestDate(
        // Use latest of blog page mtime, metadata date, or latest post update
        getPageFileMtime("blog/page.tsx"),
        getSafeDate(PAGE_METADATA.blog.dateModified),
        latestPostUpdateTime,
      ),
    },
    "/contact": {
      priority: 0.8,
      lastModified: getLatestDate(
        getPageFileMtime("contact/page.tsx"),
        getSafeDate(PAGE_METADATA.contact?.dateModified),
        new Date(), // If no date is found, use current date to ensure it's included
      ),
    },
  } as const;

  const staticEntries: MetadataRoute.Sitemap = Object.entries(staticPages).map(
    ([route, { priority, lastModified }]) => ({
      url: `${siteUrl}${route}`,
      lastModified: lastModified,
      changeFrequency: "monthly", // Can adjust per page if needed
      priority,
    }),
  );

  // --- 2.5 Process Project Tags (query variant URLs) ---
  const uniqueProjectTags = Array.from(new Set(projects.flatMap((p) => p.tags || [])));
  const projectTagEntries: MetadataRoute.Sitemap = uniqueProjectTags.map((tag) => {
    const tagParam = encodeURIComponent(tag.replace(/ /g, "+"));
    return {
      url: `${siteUrl}/projects?tag=${tagParam}`,
      lastModified: getSafeDate(projectsUpdatedAt),
      changeFrequency: "weekly",
      priority: 0.6,
    } as MetadataRoute.Sitemap[number];
  });

  // --- 4. Combine and Return ---
  return [
    ...staticEntries,
    ...projectTagEntries,
    ...blogPostEntries,
    ...blogTagEntries,
    ...bookmarkEntries,
    ...paginatedBookmarkEntries,
    ...bookmarkTagEntries,
    ...paginatedBookmarkTagEntries,
  ];
}

// Helper function to get mtime of a specific app page file
const getPageFileMtime = (pagePath: string): Date | undefined => {
  // Ensure path starts within 'app' directory
  const safePagePath = pagePath.startsWith("app/") ? pagePath : `app/${pagePath}`;
  const filePath = path.join(process.cwd(), safePagePath);
  try {
    return fs.statSync(filePath).mtime;
  } catch (statError) {
    // Don't log error if file simply doesn't exist (e.g., for metadata-based dates)
    if ((statError as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(`Sitemap: Failed to get mtime for page file ${filePath}:`, statError);
    }
    return undefined;
  }
};
