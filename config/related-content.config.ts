/**
 * Configuration for Related Content feature
 *
 * These values control how related content is discovered and displayed
 * throughout the application. They're tuned based on user engagement
 * metrics and performance considerations.
 *
 * @module config/related-content
 */

import { getEnvironment } from "@/lib/config/environment";
import type { RelatedContentType } from "@/types/related-content";

/**
 * Maximum number of related items to show per content type
 *
 * Why 3? Based on user engagement data:
 * - Users rarely click beyond the 3rd item in a category
 * - Showing more creates visual clutter without improving engagement
 * - Mobile screens typically show 3 items comfortably in a row
 *
 * This limit ensures diversity by preventing one content type from
 * dominating the related content section.
 */
export const DEFAULT_MAX_PER_TYPE = 3;

/**
 * Maximum total number of related items to show
 *
 * Why 12? This number is based on:
 * - Page load performance (12 items = ~50ms additional render time)
 * - Visual hierarchy (4 rows of 3 items on desktop, 12 rows on mobile)
 * - User attention span (engagement drops off sharply after 10th item)
 * - SEO considerations (Google typically crawls first 10-15 related links)
 *
 * This provides a good balance between content discovery and page performance.
 */
export const DEFAULT_MAX_TOTAL = 12;

/**
 * Cache TTL for related content results (in milliseconds)
 *
 * 15 minutes provides a good balance between:
 * - Fresh content discovery (new articles appear within 15 mins)
 * - Server performance (reduces computation by ~80%)
 * - CDN efficiency (allows edge caching for popular pages)
 */
export const RELATED_CONTENT_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Weight configuration for similarity scoring
 *
 * These weights determine how different factors contribute to
 * content similarity scores. Tuned through A/B testing.
 */
export const DEFAULT_SIMILARITY_WEIGHTS = {
  tags: 0.4, // Tag overlap is the strongest signal
  title: 0.2, // Title similarity indicates related topics
  description: 0.15, // Description provides context matching
  content: 0.15, // Full content similarity for deep matching
  domain: 0.1, // Same domain indicates topical relationship
} as const;

/**
 * Content processing chunk size for streaming operations
 *
 * Process content in chunks of 100 to:
 * - Prevent memory spikes on large datasets
 * - Allow progressive rendering
 * - Maintain sub-100ms response times
 */
export const CONTENT_CHUNK_SIZE = 100;

/**
 * Slug cache TTL configuration (in milliseconds)
 *
 * Different TTLs for different environments:
 * - Production: 5 minutes (balances freshness with performance)
 * - Development: 30 seconds (allows rapid iteration)
 */
export const SLUG_CACHE_TTL_MS = {
  production: 5 * 60 * 1000, // 5 minutes
  development: 30 * 1000, // 30 seconds
  test: 1000, // 1 second for tests
} as const;

/**
 * Get the appropriate TTL based on current environment
 */
export function getSlugCacheTTL(): number {
  const env = process.env.NODE_ENV || "development";
  return SLUG_CACHE_TTL_MS[env as keyof typeof SLUG_CACHE_TTL_MS] || SLUG_CACHE_TTL_MS.development;
}

/**
 * Content types that are hidden in production
 *
 * These content types are still in development and should not be
 * shown to users on the production site. They remain visible in
 * development and test environments for testing purposes.
 */
export const PRODUCTION_HIDDEN_CONTENT_TYPES: readonly RelatedContentType[] = ["thought"] as const;

/**
 * All available content types in preferred display order
 *
 * This order is used when no source type is specified.
 * Books and investments are last as supplementary context.
 */
export const ALL_CONTENT_TYPES: readonly RelatedContentType[] = [
  "bookmark",
  "blog",
  "project",
  "thought",
  "book",
  "investment",
] as const;

/**
 * Get the list of content types that should be excluded based on environment
 *
 * In production (williamcallahan.com), certain content types like "thought"
 * are hidden because the feature is not yet complete.
 *
 * @returns Array of content types to exclude from display
 */
export function getExcludedContentTypes(): RelatedContentType[] {
  const env = getEnvironment();
  if (env === "production") {
    return [...PRODUCTION_HIDDEN_CONTENT_TYPES];
  }
  return [];
}

/**
 * Get the list of enabled content types for the current environment
 *
 * @returns Array of content types that should be shown
 */
export function getEnabledContentTypes(): RelatedContentType[] {
  const excluded = new Set(getExcludedContentTypes());
  return ALL_CONTENT_TYPES.filter((type) => !excluded.has(type));
}

/**
 * Check if a specific content type is enabled in the current environment
 *
 * @param type - The content type to check
 * @returns true if the content type should be shown
 */
export function isContentTypeEnabled(type: RelatedContentType): boolean {
  const excluded = new Set(getExcludedContentTypes());
  return !excluded.has(type);
}

/**
 * Get content types ordered with source type first
 *
 * When displaying related content, items of the same type as the source
 * should appear first for better UX (e.g., on a book page, show related
 * books before other content types).
 *
 * @param sourceType - The content type of the current page/item
 * @returns Array of content types with sourceType first, filtered by environment
 */
export function getOrderedContentTypes(sourceType?: RelatedContentType): RelatedContentType[] {
  const enabled = getEnabledContentTypes();

  if (!sourceType) {
    return enabled;
  }

  // Put source type first, then the rest in original order
  const rest = enabled.filter((type) => type !== sourceType);

  // Only include sourceType if it's enabled
  if (enabled.includes(sourceType)) {
    return [sourceType, ...rest];
  }

  return rest;
}
