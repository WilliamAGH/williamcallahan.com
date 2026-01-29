/**
 * Server-side function to filter blog posts based on a query.
 * Builds a cached MiniSearch index over title, excerpt, tags, and author name.
 *
 * @param query - The search query string.
 * @returns A promise that resolves to an array of matching SearchResult objects.
 */

import { assertServerOnly } from "../utils/ensure-server-only";
assertServerOnly(); // Ensure this module runs only on the server

import MiniSearch from "minisearch";
import type { SearchResult } from "@/types/search";
import { ServerCacheInstance } from "../server-cache";
import { sanitizeSearchQuery } from "../validators/search";
import { prepareDocumentsForIndexing } from "../utils/search-helpers";
import { getAllMDXPostsForSearch } from "./mdx";
import type { BlogPost } from "@/types/blog";

// Cache key and TTL for blog search index
const BLOG_INDEX_CACHE_KEY = "search:index:blog-posts";
const BLOG_INDEX_TTL_SECONDS = 60 * 60; // 1 hour

async function getBlogSearchIndex(): Promise<MiniSearch<BlogPost>> {
  const cached = ServerCacheInstance.get<MiniSearch<BlogPost>>(BLOG_INDEX_CACHE_KEY);
  if (cached) return cached;

  const posts = await getAllMDXPostsForSearch();
  const index = new MiniSearch<BlogPost>({
    fields: ["title", "excerpt", "tags", "authorName"],
    storeFields: ["slug", "title", "excerpt", "publishedAt"],
    idField: "slug",
    searchOptions: {
      boost: { title: 2 },
      fuzzy: 0.1,
      prefix: true,
    },
    extractField: (document, fieldName) => {
      if (fieldName === "authorName") {
        return document.author?.name || "";
      }
      if (fieldName === "tags") {
        return Array.isArray(document.tags) ? document.tags.join(" ") : "";
      }
      const field = fieldName as keyof BlogPost;
      const value = document[field];
      return typeof value === "string" ? value : "";
    },
  });

  const dedupedPosts = prepareDocumentsForIndexing(posts, "Blog Posts", (post) => post.slug);
  index.addAll(dedupedPosts);

  ServerCacheInstance.set(BLOG_INDEX_CACHE_KEY, index, BLOG_INDEX_TTL_SECONDS);
  return index;
}

/**
 * Server-side function to filter blog posts based on a query.
 * Searches title, excerpt, tags, and author name (raw content excluded for memory efficiency).
 *
 * @param query - The search query string.
 * @returns A promise that resolves to an array of matching SearchResult objects.
 */
export async function searchBlogPostsServerSide(query: string): Promise<SearchResult[]> {
  const sanitizedQuery = sanitizeSearchQuery(query);
  if (!sanitizedQuery) {
    return [];
  }

  const index = await getBlogSearchIndex();

  const rawResults = index.search(sanitizedQuery, {
    prefix: true,
    fuzzy: 0.1,
    boost: { title: 2, excerpt: 1.25, authorName: 1.1 },
    combineWith: "AND",
  }) as Array<{
    id: string | number;
    slug?: string;
    title?: string;
    excerpt?: string;
    publishedAt?: string;
    score?: number;
  }>;

  // Map to SearchResult and keep a deterministic sort: score desc, then recency
  return rawResults
    .map((result) => ({
      id: String(result.id),
      type: "blog-post" as const,
      title: result.title ?? "Untitled Post",
      description: result.excerpt ?? "No excerpt available.",
      url: `/blog/${result.slug ?? result.id}`,
      score: result.score ?? 0,
      publishedAt: result.publishedAt,
    }))
    .toSorted((a, b) => {
      const scoreDiff = b.score - a.score;
      if (Math.abs(scoreDiff) > 0.01) return scoreDiff;
      const aDate = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const bDate = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return bDate - aDate;
    })
    .map(({ publishedAt: _publishedAt, ...rest }) => rest);
}
