/**
 * Tag Aggregator
 *
 * Generic tag counting utility for aggregating tags across content types.
 * Replaces the 4 nearly identical tag counting functions.
 *
 * @module lib/search/tag-aggregator
 */

import type { AggregatedTag, TagSource } from "@/types/search";
import { tagToSlug } from "@/lib/utils/tag-utils";

/**
 * Aggregates tags from a collection of items with counts.
 *
 * This generic function replaces the 4 nearly identical tag counting functions:
 * - getBlogTagsWithCounts
 * - getProjectTagsWithCounts
 * - getBookmarkTagsWithCounts
 * - getBookGenresWithCounts
 *
 * @template T - The item type containing tags
 * @param source - Tag source configuration
 * @returns Array of aggregated tags with counts, sorted by count descending
 *
 * @example
 * ```typescript
 * // Blog tags
 * const blogTags = await aggregateTags({
 *   items: async () => await getAllMDXPostsForSearch(),
 *   getTags: (post) => post.tags,
 *   contentType: "blog",
 *   urlPattern: (slug) => `/blog/tags/${slug}`,
 * });
 *
 * // Project tags (sync)
 * const projectTags = await aggregateTags({
 *   items: projectsData,
 *   getTags: (p) => p.tags,
 *   contentType: "projects",
 *   urlPattern: (slug) => `/projects?tag=${slug}`,
 * });
 * ```
 */
export async function aggregateTags<T>(source: TagSource<T>): Promise<AggregatedTag[]> {
  // Get items (supports both sync arrays and async functions)
  const items = typeof source.items === "function" ? await source.items() : source.items;

  const tagCounts = new Map<string, number>();

  for (const item of items) {
    const tags = source.getTags(item);
    if (!tags) continue;

    for (const tag of tags) {
      const normalizedTag = tag.toLowerCase();
      tagCounts.set(normalizedTag, (tagCounts.get(normalizedTag) ?? 0) + 1);
    }
  }

  return Array.from(tagCounts.entries())
    .map(([tag, count]) => ({
      name: tag,
      slug: tagToSlug(tag),
      contentType: source.contentType,
      count,
      url: source.urlPattern(tagToSlug(tag)),
    }))
    .toSorted((a, b) => b.count - a.count);
}

/**
 * Aggregates tags from multiple sources into a single array.
 * Useful for site-wide tag search across all content types.
 *
 * @param sources - Array of tag sources to aggregate
 * @returns Combined array of aggregated tags from all sources
 *
 * @example
 * ```typescript
 * const allTags = await aggregateMultipleSources([
 *   { items: posts, getTags: p => p.tags, contentType: "blog", urlPattern: s => `/blog/tags/${s}` },
 *   { items: projects, getTags: p => p.tags, contentType: "projects", urlPattern: s => `/projects?tag=${s}` },
 * ]);
 * ```
 */
export async function aggregateMultipleSources<T>(sources: TagSource<T>[]): Promise<AggregatedTag[]> {
  const results = await Promise.all(sources.map(source => aggregateTags(source)));
  return results.flat();
}
