/**
 * Tag Search
 *
 * Search tags across all content types: blog, bookmarks, projects, books.
 * Uses the tag aggregator to collect and search tags.
 *
 * @module lib/search/searchers/tag-search
 */

import type { SearchResult, AggregatedTag } from "@/types/search";
import { ServerCacheInstance } from "@/lib/server-cache";
import { sanitizeSearchQuery } from "@/lib/validators/search";
import { envLogger } from "@/lib/utils/env-logger";
import { formatTagDisplay } from "@/lib/utils/tag-utils";
import { aggregateTags } from "../tag-aggregator";
import { getBookmarksIndex, getCachedBooksData } from "../loaders/dynamic-content";
import { projectsData } from "../loaders/static-content";

// Cache key and TTL for aggregated tags
const TAGS_CACHE_KEY = "search:aggregated-tags";
const TAGS_CACHE_TTL = 10 * 60; // 10 minutes

/**
 * Get blog post tags with counts from MDX posts.
 */
async function getBlogTagsWithCounts(): Promise<AggregatedTag[]> {
  try {
    const { getAllMDXPostsForSearch } = await import("@/lib/blog/mdx");
    const posts = await getAllMDXPostsForSearch();

    return aggregateTags({
      items: posts,
      getTags: (post) => post.tags,
      contentType: "blog",
      urlPattern: (slug) => `/blog/tags/${slug}`,
    });
  } catch (error) {
    envLogger.log("Failed to get blog tags", { error: String(error) }, { category: "Search" });
    return [];
  }
}

/**
 * Get project tags with counts.
 */
function getProjectTagsWithCounts(): AggregatedTag[] {
  return aggregateTags({
    items: projectsData,
    getTags: (p) => p.tags,
    contentType: "projects",
    urlPattern: (slug) => `/projects?tag=${slug}`,
  }) as unknown as AggregatedTag[]; // Sync version returns directly
}

/**
 * Get bookmark tags with counts from indexed bookmarks.
 */
async function getBookmarkTagsWithCounts(): Promise<AggregatedTag[]> {
  try {
    const { bookmarks } = await getBookmarksIndex();

    return aggregateTags({
      items: bookmarks,
      getTags: (bookmark) => bookmark.tags.split("\n").filter(Boolean),
      contentType: "bookmarks",
      urlPattern: (slug) => `/bookmarks/tags/${slug}`,
    });
  } catch (error) {
    envLogger.log("Failed to get bookmark tags", { error: String(error) }, { category: "Search" });
    return [];
  }
}

/**
 * Get book genres with counts.
 */
async function getBookGenresWithCounts(): Promise<AggregatedTag[]> {
  try {
    const books = await getCachedBooksData();

    return aggregateTags({
      items: books,
      getTags: (book) => book.genres,
      contentType: "books",
      urlPattern: (slug) => `/books?genre=${slug}`,
    });
  } catch (error) {
    envLogger.log("Failed to get book genres", { error: String(error) }, { category: "Search" });
    return [];
  }
}

/**
 * Aggregate all tags from all content types.
 */
async function aggregateAllTags(): Promise<AggregatedTag[]> {
  // Check cache first
  const cached = ServerCacheInstance.get<AggregatedTag[]>(TAGS_CACHE_KEY);
  if (cached) {
    return cached;
  }

  // Gather tags from all sources in parallel
  const [blogTags, projectTags, bookmarkTags, bookGenres] = await Promise.all([
    getBlogTagsWithCounts(),
    Promise.resolve(getProjectTagsWithCounts()),
    getBookmarkTagsWithCounts(),
    getBookGenresWithCounts(),
  ]);

  const allTags = [...blogTags, ...projectTags, ...bookmarkTags, ...bookGenres];

  // Cache the aggregated tags
  ServerCacheInstance.set(TAGS_CACHE_KEY, allTags, TAGS_CACHE_TTL);

  return allTags;
}

/**
 * Format tag title for terminal display.
 * Format: [Blog] > [Tags] > React
 */
function formatTagTitle(tag: AggregatedTag): string {
  const categoryLabel: Record<AggregatedTag["contentType"], string> = {
    blog: "Blog",
    bookmarks: "Bookmarks",
    projects: "Projects",
    books: "Books",
  };

  const tagTypeLabel = tag.contentType === "books" ? "Genres" : "Tags";
  const displayName = formatTagDisplay(tag.name);

  return `[${categoryLabel[tag.contentType]}] > [${tagTypeLabel}] > ${displayName}`;
}

/**
 * Search tags across all content types.
 * Returns tags matching the query with proper hierarchy display.
 */
export async function searchTags(query: string): Promise<SearchResult[]> {
  const sanitizedQuery = sanitizeSearchQuery(query);
  if (!sanitizedQuery) return [];

  // Check result cache first
  const cached = ServerCacheInstance.getSearchResults<SearchResult>("tags", sanitizedQuery);
  if (cached && !ServerCacheInstance.shouldRefreshSearch("tags", sanitizedQuery)) {
    return cached.results;
  }

  const allTags = await aggregateAllTags();

  // Filter tags by query using fuzzy substring matching
  const queryLower = sanitizedQuery.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter(Boolean);

  const matchingTags = allTags
    .map((tag) => {
      const tagNameLower = tag.name.toLowerCase();

      // Calculate match score
      let score = 0;

      // Exact match gets highest score
      if (tagNameLower === queryLower) {
        score = 1.0;
      }
      // Starts with query gets high score
      else if (tagNameLower.startsWith(queryLower)) {
        score = 0.8;
      }
      // Contains all query terms
      else if (queryTerms.every((term) => tagNameLower.includes(term))) {
        score = 0.6;
      }
      // Contains any query term
      else if (queryTerms.some((term) => tagNameLower.includes(term))) {
        score = 0.4;
      }
      // No match
      else {
        return null;
      }

      // Boost score by count (more items = more relevant tag)
      const countBoost = Math.min(tag.count / 20, 0.2); // Max 0.2 boost
      score += countBoost;

      return { tag, score };
    })
    .filter((result): result is { tag: AggregatedTag; score: number } => result !== null)
    .toSorted((a, b) => b.score - a.score);

  // Limit results per content type to prevent overwhelming results
  const MAX_TAGS_PER_TYPE = 5;
  const tagsByType = new Map<AggregatedTag["contentType"], number>();
  const limitedTags = matchingTags.filter(({ tag }) => {
    const currentCount = tagsByType.get(tag.contentType) ?? 0;
    if (currentCount >= MAX_TAGS_PER_TYPE) return false;
    tagsByType.set(tag.contentType, currentCount + 1);
    return true;
  });

  // Transform to SearchResult format
  const results: SearchResult[] = limitedTags.map(({ tag, score }) => ({
    id: `tag:${tag.contentType}:${tag.slug}`,
    type: "tag" as const,
    title: formatTagTitle(tag),
    description: `${tag.count} ${tag.contentType === "books" ? "books" : tag.contentType === "blog" ? "posts" : "items"}`,
    url: tag.url,
    score,
  }));

  // Cache results
  ServerCacheInstance.setSearchResults("tags", sanitizedQuery, results);

  return results;
}
