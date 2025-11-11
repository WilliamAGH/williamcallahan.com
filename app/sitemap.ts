/**
 * Sitemap Generation
 * @module app/sitemap
 * @description
 * Generates sitemap.xml without enumerating every dynamic bookmark route at build time.
 * The sitemap now streams bookmark pages on-demand so builds stay memory safe even when the dataset grows.
 *
 * @see {@link "https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap"} - Next.js Sitemap API
 * @see {@link "../data/metadata.ts"} - Source of page metadata including dates
 */

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { MetadataRoute } from "next";
import { connection } from "next/server";

import {
  getBookmarksIndex,
  getBookmarksPage,
  listBookmarkTagSlugs,
  getTagBookmarksIndex,
} from "@/lib/bookmarks/service.server";
import { kebabCase } from "@/lib/utils/formatters";
import type { UnifiedBookmark } from "@/types";

import { updatedAt as educationUpdatedAt } from "../data/education";
import { updatedAt as experienceUpdatedAt } from "../data/experience";
import { updatedAt as investmentsUpdatedAt } from "../data/investments";
import { PAGE_METADATA, metadata as siteMetadata } from "../data/metadata";
import { updatedAt as projectsUpdatedAt, projects } from "../data/projects";

const BOOKMARK_CHANGE_FREQUENCY: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]> = "weekly";
const BOOKMARK_PRIORITY = 0.65;
const BOOKMARK_TAG_PRIORITY = 0.6;
const BOOKMARK_TAG_PAGE_PRIORITY = 0.55;

const sanitizePathSegment = (segment: string): string => segment.replace(/[^\u0020-\u007E]/g, "");

// Helper function to safely parse a date string (including simple YYYY-MM-DD)
const getSafeDate = (dateInput: string | Date | number | undefined | null): Date | undefined => {
  if (!dateInput) return undefined;
  try {
    let dateStr = String(dateInput);
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
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
const getLatestDate = (...dates: (Date | undefined)[]): Date | undefined =>
  dates.reduce<Date | undefined>((latest, current) => {
    if (current && (!latest || current > latest)) {
      return current;
    }
    return latest;
  }, undefined);

const resolveBookmarkLastModified = (
  bookmark: Pick<UnifiedBookmark, "modifiedAt" | "dateUpdated" | "dateCreated" | "dateBookmarked">,
): Date | undefined =>
  getLatestDate(
    getSafeDate(bookmark.modifiedAt),
    getSafeDate(bookmark.dateUpdated),
    getSafeDate(bookmark.dateCreated),
    getSafeDate(bookmark.dateBookmarked),
  );

const buildPaginatedBookmarkEntries = (
  siteUrl: string,
  totalPages: number,
  latestBookmarkUpdateTime: Date | undefined,
): MetadataRoute.Sitemap => {
  const entries: MetadataRoute.Sitemap = [];
  for (let page = 2; page <= totalPages; page++) {
    const entry: MetadataRoute.Sitemap[number] = {
      url: `${siteUrl}/bookmarks/page/${page}`,
      changeFrequency: BOOKMARK_CHANGE_FREQUENCY,
      priority: BOOKMARK_PRIORITY,
    };
    if (latestBookmarkUpdateTime) {
      entry.lastModified = latestBookmarkUpdateTime;
    }
    entries.push(entry);
  }
  return entries;
};

const collectBookmarkSitemapData = async (
  siteUrl: string,
): Promise<{
  entries: MetadataRoute.Sitemap;
  paginatedEntries: MetadataRoute.Sitemap;
  latestBookmarkUpdateTime?: Date;
}> => {
  const index = await getBookmarksIndex();
  if (!index || !index.totalPages || index.totalPages < 1) {
    return {
      entries: [],
      paginatedEntries: [],
      latestBookmarkUpdateTime: undefined,
    };
  }

  const totalPages = Math.max(1, index.totalPages);
  const bookmarkEntries: MetadataRoute.Sitemap = [];
  let latestBookmarkUpdateTime: Date | undefined;

  for (let page = 1; page <= totalPages; page++) {
    const pageBookmarks = await getBookmarksPage(page);
    if (!Array.isArray(pageBookmarks) || pageBookmarks.length === 0) {
      continue;
    }

    for (const bookmark of pageBookmarks) {
      const slug = bookmark.slug;
      if (!slug) {
        console.warn(`[Sitemap] Skipping bookmark ${bookmark.id} because slug is missing.`);
        continue;
      }

      const lastModified = resolveBookmarkLastModified(bookmark);
      latestBookmarkUpdateTime = getLatestDate(latestBookmarkUpdateTime, lastModified);
      bookmarkEntries.push({
        url: `${siteUrl}/bookmarks/${sanitizePathSegment(slug)}`,
        lastModified,
        changeFrequency: BOOKMARK_CHANGE_FREQUENCY,
        priority: BOOKMARK_PRIORITY,
      });
    }
  }

  const paginatedEntries = buildPaginatedBookmarkEntries(siteUrl, totalPages, latestBookmarkUpdateTime);

  return {
    entries: bookmarkEntries,
    paginatedEntries,
    latestBookmarkUpdateTime,
  };
};

const collectTagSitemapData = async (
  siteUrl: string,
): Promise<{
  tagEntries: MetadataRoute.Sitemap;
  paginatedTagEntries: MetadataRoute.Sitemap;
}> => {
  const tagEntries: MetadataRoute.Sitemap = [];
  const paginatedTagEntries: MetadataRoute.Sitemap = [];

  const tagSlugs = await listBookmarkTagSlugs();
  if (tagSlugs.length === 0) {
    return { tagEntries, paginatedTagEntries };
  }

  for (const rawSlug of tagSlugs) {
    const tagIndex = await getTagBookmarksIndex(rawSlug);
    if (!tagIndex) {
      continue;
    }

    const totalPages = Math.max(1, tagIndex.totalPages ?? 0);
    const sanitizedSlug = sanitizePathSegment(rawSlug);
    const baseUrl = `${siteUrl}/bookmarks/tags/${sanitizedSlug}`;
    const tagLastModified = getSafeDate(tagIndex.lastModified);

    tagEntries.push({
      url: baseUrl,
      lastModified: tagLastModified,
      changeFrequency: BOOKMARK_CHANGE_FREQUENCY,
      priority: BOOKMARK_TAG_PRIORITY,
    });

    for (let page = 2; page <= totalPages; page++) {
      paginatedTagEntries.push({
        url: `${baseUrl}/page/${page}`,
        lastModified: tagLastModified,
        changeFrequency: BOOKMARK_CHANGE_FREQUENCY,
        priority: BOOKMARK_TAG_PAGE_PRIORITY,
      });
    }
  }

  return { tagEntries, paginatedTagEntries };
};

// --- Main Sitemap Generation ---
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();

  const siteUrl = siteMetadata.site.url;
  const postsDirectory = path.join(process.cwd(), "data/blog/posts");

  // --- 1. Process Blog Posts and Tags ---
  const postsData: { slug: string; lastModified: Date | undefined; tags: string[] }[] = [];
  const tagLastModifiedMap: Record<string, Date> = {};
  let latestPostUpdateTime: Date | undefined;

  try {
    const filenames = fs.readdirSync(postsDirectory);
    const mdxFiles = filenames.filter(filename => filename.endsWith(".mdx"));
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

      latestPostUpdateTime = getLatestDate(latestPostUpdateTime, postLastModified);

      if (postLastModified && Array.isArray(data.tags)) {
        for (const tag of data.tags as string[]) {
          const tagSlug = kebabCase(tag);
          tagLastModifiedMap[tagSlug] =
            getLatestDate(tagLastModifiedMap[tagSlug], postLastModified) ?? postLastModified;
        }
      }
    }
  } catch (error) {
    console.error("Sitemap: Error reading blog posts directory:", error);
  }

  const blogPostEntries: MetadataRoute.Sitemap = postsData.map(post => ({
    url: `${siteUrl}/blog/${post.slug}`,
    lastModified: post.lastModified,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const blogTagEntries: MetadataRoute.Sitemap = Object.entries(tagLastModifiedMap).map(([tagSlug, lastModified]) => ({
    url: `${siteUrl}/blog/tags/${tagSlug}`,
    lastModified,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  // --- 2. Process Bookmarks and Bookmark Tags without loading the full dataset ---
  const {
    entries: bookmarkEntries,
    paginatedEntries: paginatedBookmarkEntries,
    latestBookmarkUpdateTime,
  } = await collectBookmarkSitemapData(siteUrl);

  const { tagEntries: bookmarkTagEntries, paginatedTagEntries: paginatedBookmarkTagEntries } =
    await collectTagSitemapData(siteUrl);

  // --- 3. Process Static Pages ---
  const staticPages = {
    "/": {
      priority: 1.0,
      lastModified: getSafeDate(PAGE_METADATA.home.dateModified),
    },
    "/experience": { priority: 0.8, lastModified: getSafeDate(experienceUpdatedAt) },
    "/cv": {
      priority: 0.85,
      lastModified: getLatestDate(getSafeDate(PAGE_METADATA.cv?.dateModified), getSafeDate(experienceUpdatedAt)),
    },
    "/investments": { priority: 0.9, lastModified: getSafeDate(investmentsUpdatedAt) },
    "/education": { priority: 0.7, lastModified: getSafeDate(educationUpdatedAt) },
    "/projects": { priority: 0.9, lastModified: getSafeDate(projectsUpdatedAt) },
    "/bookmarks": {
      priority: 0.7,
      lastModified: getLatestDate(getSafeDate(PAGE_METADATA.bookmarks?.dateModified), latestBookmarkUpdateTime),
    },
    "/blog": {
      priority: 0.9,
      lastModified: getLatestDate(getSafeDate(PAGE_METADATA.blog.dateModified), latestPostUpdateTime),
    },
    "/contact": {
      priority: 0.8,
      lastModified: getLatestDate(
        getSafeDate(PAGE_METADATA.contact?.dateModified),
        new Date(), // fallback to current date
      ),
    },
  } as const;

  const staticEntries: MetadataRoute.Sitemap = Object.entries(staticPages).map(
    ([route, { priority, lastModified }]) => ({
      url: `${siteUrl}${route}`,
      lastModified,
      changeFrequency: "monthly",
      priority,
    }),
  );

  // --- 3.5 Process Project Tags (query variant URLs) ---
  const uniqueProjectTags = Array.from(new Set(projects.flatMap(p => p.tags || [])));
  const projectTagEntries: MetadataRoute.Sitemap = uniqueProjectTags.map(tag => {
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
