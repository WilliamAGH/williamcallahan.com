/**
 * Sitemap Generation (Orchestrator)
 * @module app/sitemap
 * @description
 * Generates sitemap.xml by delegating to domain-specific collectors in
 * `src/lib/sitemap/`. This orchestrator owns the runtime cache, static page
 * entries, and the final combination of all sitemap sections.
 *
 * @remarks
 * **Dual-purpose module**: This file serves two roles:
 * 1. **Next.js route** - Compiled into `.next/` to serve `/sitemap.xml` endpoint
 * 2. **Runtime import** - Directly imported by `scripts/submit-sitemap.ts` and
 *    `scripts/verify-no-404s.ts` which call `sitemap()` to get URLs for search
 *    engine submission and link validation
 *
 * Because of (2), the source file is explicitly copied to the Docker image
 * (see Dockerfile line ~230). Moving or renaming this file requires updating
 * both the Dockerfile and the importing scripts.
 *
 * @see {@link "../lib/sitemap/bookmark-collectors"} - Bookmark & tag collectors
 * @see {@link "../lib/sitemap/content-collectors"} - Book & thought collectors
 * @see {@link "../lib/sitemap/blog-collector"} - Blog post & tag collector
 * @see {@link "../lib/sitemap/constants"} - Shared sitemap constants
 * @see {@link "../lib/sitemap/date-utils"} - Date parsing utilities
 */

import type { MetadataRoute } from "next";

import { updatedAt as educationUpdatedAt } from "@/data/education";
import { updatedAt as experienceUpdatedAt } from "@/data/experience";
import { updatedAt as investmentsUpdatedAt } from "@/data/investments";
import { PAGE_METADATA, metadata as siteMetadata } from "@/data/metadata";
import { updatedAt as projectsUpdatedAt, projects } from "@/data/projects";

import { collectBlogSitemapData } from "@/lib/sitemap/blog-collector";
import {
  collectBookmarkSitemapData,
  collectTagSitemapData,
} from "@/lib/sitemap/bookmark-collectors";
import {
  BOOK_PRIORITY,
  SITEMAP_RUNTIME_CACHE_TTL_MS,
  THOUGHT_PRIORITY,
} from "@/lib/sitemap/constants";
import {
  collectBookSitemapData,
  collectThoughtSitemapData,
} from "@/lib/sitemap/content-collectors";
import { getLatestDate, getSafeDate, isTestEnvironment } from "@/lib/sitemap/date-utils";

// Metadata route handlers are cached by default; force runtime execution so
// sitemap output cannot be frozen from a build-phase environment snapshot.
export const dynamic = "force-dynamic";

let runtimeSitemapCache: {
  generatedAt: number;
  entries: MetadataRoute.Sitemap;
} | null = null;
let inFlightSitemapBuild: Promise<MetadataRoute.Sitemap> | null = null;

const buildSitemapEntries = async (): Promise<MetadataRoute.Sitemap> => {
  const siteUrl = siteMetadata.site.url;

  // Blog collector is synchronous (filesystem reads); call directly.
  const blogData = collectBlogSitemapData(siteUrl);

  // Async collectors run in parallel.
  const [bookmarkData, tagData, bookData, thoughtData] = await Promise.all([
    collectBookmarkSitemapData(siteUrl),
    collectTagSitemapData(siteUrl),
    collectBookSitemapData(siteUrl),
    collectThoughtSitemapData(siteUrl),
  ]);

  // --- Static pages ---
  const staticPages = {
    "/": {
      priority: 1.0,
      lastModified: getSafeDate(PAGE_METADATA.home.dateModified),
    },
    "/experience": { priority: 0.8, lastModified: getSafeDate(experienceUpdatedAt) },
    "/cv": {
      priority: 0.85,
      lastModified: getLatestDate(
        getSafeDate(PAGE_METADATA.cv?.dateModified),
        getSafeDate(experienceUpdatedAt),
      ),
    },
    "/investments": { priority: 0.9, lastModified: getSafeDate(investmentsUpdatedAt) },
    "/education": { priority: 0.7, lastModified: getSafeDate(educationUpdatedAt) },
    "/projects": { priority: 0.9, lastModified: getSafeDate(projectsUpdatedAt) },
    "/bookmarks": {
      priority: 0.7,
      lastModified: getLatestDate(
        getSafeDate(PAGE_METADATA.bookmarks?.dateModified),
        bookmarkData.latestBookmarkUpdateTime,
      ),
    },
    "/blog": {
      priority: 0.9,
      lastModified: getLatestDate(
        getSafeDate(PAGE_METADATA.blog.dateModified),
        blogData.latestPostUpdateTime,
      ),
    },
    "/books": {
      priority: BOOK_PRIORITY,
      lastModified: getLatestDate(
        getSafeDate(PAGE_METADATA.books?.dateModified),
        bookData.latestBookUpdateTime,
      ),
    },
    "/thoughts": {
      priority: THOUGHT_PRIORITY,
      lastModified: getLatestDate(
        getSafeDate(PAGE_METADATA.thoughts?.dateModified),
        thoughtData.latestThoughtUpdateTime,
      ),
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

  // --- Project tag entries (query variant URLs) ---
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

  // --- Combine and return ---
  return [
    ...staticEntries,
    ...projectTagEntries,
    ...blogData.blogPostEntries,
    ...blogData.blogTagEntries,
    ...bookData.entries,
    ...thoughtData.entries,
    ...bookmarkData.entries,
    ...bookmarkData.paginatedEntries,
    ...tagData.tagEntries,
    ...tagData.paginatedTagEntries,
  ];
};

const hasFreshRuntimeSitemapCache = (): boolean =>
  !!runtimeSitemapCache &&
  Date.now() - runtimeSitemapCache.generatedAt < SITEMAP_RUNTIME_CACHE_TTL_MS;

// --- Main Sitemap Generation ---
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (isTestEnvironment()) {
    return buildSitemapEntries();
  }

  if (hasFreshRuntimeSitemapCache()) {
    return runtimeSitemapCache!.entries;
  }

  if (inFlightSitemapBuild) {
    return inFlightSitemapBuild;
  }

  inFlightSitemapBuild = buildSitemapEntries()
    .then((entries) => {
      runtimeSitemapCache = {
        generatedAt: Date.now(),
        entries,
      };
      return entries;
    })
    .finally(() => {
      inFlightSitemapBuild = null;
    });

  return inFlightSitemapBuild;
}
