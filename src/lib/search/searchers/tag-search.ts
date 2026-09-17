/**
 * Tag Search
 *
 * Search tags across all content types: blog, bookmarks, projects, books.
 * Tag counts come from one PostgreSQL aggregate (see db/queries/tag-counts).
 *
 * @module lib/search/searchers/tag-search
 */

import type { SearchResult, AggregatedTag } from "@/types/schemas/search";
import { sanitizeSearchQuery } from "@/lib/validators/search";
import { formatTagDisplay } from "@/lib/utils/tag-utils";
import { listTagCounts } from "@/lib/db/queries/tag-counts";
import { scoreByRank } from "../search-content";

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

  const allTags = await listTagCounts();

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

  const results: SearchResult[] = limitedTags.map(({ tag, score }) => ({
    id: `tag:${tag.contentType}:${tag.slug}`,
    type: "tag" as const,
    title: formatTagTitle(tag),
    description: `${tag.count} ${tag.contentType === "books" ? "books" : tag.contentType === "blog" ? "posts" : "items"}`,
    url: tag.url,
    score,
  }));

  return scoreByRank(results);
}
