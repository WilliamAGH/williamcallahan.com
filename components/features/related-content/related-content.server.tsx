/**
 * RelatedContent Server Component
 *
 * Fetches and displays related content recommendations for a given source item.
 * Uses server-side rendering for optimal performance and SEO.
 */

import { getContentById, filterByTypes } from "@/lib/content-similarity/aggregator";
import { getLazyContentMap, getCachedAllContent } from "@/lib/content-similarity/cached-aggregator";
import { findMostSimilar, limitByTypeAndTotal } from "@/lib/content-similarity";
import { ServerCacheInstance } from "@/lib/server-cache";
import { RelatedContentSection } from "./related-content-section";
import { ensureAbsoluteUrl } from "@/lib/seo/utils";
import { debug } from "@/lib/utils/debug";
import { getCachedBookmarksWithSlugs } from "@/lib/bookmarks/request-cache";
import { loadSlugMapping } from "@/lib/bookmarks/slug-manager";
import { readJsonS3 } from "@/lib/s3-utils";
import { CONTENT_GRAPH_S3_PATHS } from "@/lib/constants";
import { selectBestImage } from "@/lib/bookmarks/bookmark-helpers";
import { buildCdnUrl, getCdnConfigFromEnv } from "@/lib/utils/cdn-utils";
import type {
  RelatedContentProps,
  RelatedContentItem,
  RelatedContentType,
  NormalizedContent,
  RelatedContentCacheData,
} from "@/types/related-content";
import type { UnifiedBookmark } from "@/types/bookmark";

// Import configuration with documented rationale
import { DEFAULT_MAX_PER_TYPE, DEFAULT_MAX_TOTAL } from "@/config/related-content.config";

/**
 * Convert normalized content to related content item
 * Returns null if a bookmark doesn't have a pre-computed slug (critical for idempotency)
 */
function toRelatedContentItem(
  content: NormalizedContent & { score: number },
  slugMap?: Map<string, string>,
): RelatedContentItem | null {
  const baseMetadata: RelatedContentItem["metadata"] = {
    tags: content.tags,
    domain: content.domain,
    date: content.date?.toISOString(),
  };

  // Add type-specific metadata
  switch (content.type) {
    case "bookmark": {
      const bookmark = content.source as UnifiedBookmark;
      // Use pre-computed slug from mapping - REQUIRED for idempotency
      const slug = slugMap?.get(bookmark.id);

      // If no slug in mapping, this is a CRITICAL ERROR
      // Every bookmark MUST have a pre-computed slug for idempotency
      if (!slug) {
        console.error(
          `[RelatedContent] CRITICAL: Missing slug for bookmark ${bookmark.id}. ` +
            `Title="${bookmark.title}" URL="${bookmark.url}". ` +
            `Slug mapping is incomplete or not loaded.`,
        );
        // Return null to skip this item rather than generate an incorrect slug
        return null;
      }

      const url = `/bookmarks/${slug}`;
      // Use selectBestImage for consistent image selection logic
      const bestImage = selectBestImage(bookmark, { includeScreenshots: true });
      const metadata: RelatedContentItem["metadata"] = {
        ...baseMetadata,
        imageUrl: bestImage ? ensureAbsoluteUrl(bestImage) : undefined,
      };
      return {
        type: content.type,
        id: content.id,
        title: content.title,
        description: bookmark.description || "",
        url,
        score: content.score,
        metadata,
      };
    }

    case "blog": {
      const blog = content.source as import("@/types/blog").BlogPost;
      const metadata: RelatedContentItem["metadata"] = {
        ...baseMetadata,
        readingTime: blog.readingTime,
        imageUrl: blog.coverImage ? ensureAbsoluteUrl(blog.coverImage) : undefined,
        author: blog.author
          ? { name: blog.author.name, avatar: blog.author.avatar ? ensureAbsoluteUrl(blog.author.avatar) : undefined }
          : undefined,
      };

      return {
        type: content.type,
        id: content.id,
        title: content.title,
        description: blog.excerpt || "",
        url: content.url,
        score: content.score,
        metadata,
      };
    }

    case "investment": {
      const investment = content.source as import("@/types/investment").Investment;
      const metadata: RelatedContentItem["metadata"] = {
        ...baseMetadata,
        stage: investment.stage,
        category: investment.category,
        imageUrl: investment.logo ? ensureAbsoluteUrl(investment.logo) : undefined,
      };

      return {
        type: content.type,
        id: content.id,
        title: content.title,
        description: investment.description,
        url: content.url,
        score: content.score,
        metadata,
      };
    }

    case "project": {
      const project = content.source as import("@/types/project").Project;
      const metadata: RelatedContentItem["metadata"] = project.imageKey
        ? { ...baseMetadata, imageUrl: buildCdnUrl(project.imageKey, getCdnConfigFromEnv()) }
        : baseMetadata;

      return {
        type: content.type,
        id: content.id,
        title: content.title,
        description: project.shortSummary || project.description,
        url: content.url,
        score: content.score,
        metadata,
      };
    }

    default:
      return {
        type: content.type,
        id: content.id,
        title: content.title,
        description: content.text,
        url: content.url,
        score: content.score,
        metadata: baseMetadata,
      };
  }
}

export async function RelatedContent({
  sourceType,
  sourceId,
  sourceSlug,
  sectionTitle = "Similar Content",
  options = {},
  className,
}: RelatedContentProps) {
  try {
    // For bookmarks, prefer slug over ID for idempotency
    let actualSourceId = sourceId;
    if (sourceType === "bookmark" && sourceSlug) {
      // Load slug mapping to convert slug to ID for internal lookups
      const slugMapping = await loadSlugMapping();
      if (slugMapping && typeof sourceSlug === "string") {
        // Convert to Map to avoid unsafe indexed access and satisfy strict linting
        const reverse = new Map<string, string>(Object.entries(slugMapping.reverseMap));
        const bookmarkId = reverse.get(sourceSlug);
        if (bookmarkId) {
          actualSourceId = bookmarkId;
          debug(`[RelatedContent] Using slug "${sourceSlug}" resolved to ID "${bookmarkId}"`);
        } else {
          console.error(`[RelatedContent] No bookmark found for slug "${sourceSlug}"`);
          return null;
        }
      } else if (sourceSlug) {
        console.warn(
          `[RelatedContent] Slug mapping not loaded; cannot resolve slug "${sourceSlug}" to ID. ` +
            `Proceeding with sourceId="${sourceId}".`,
        );
      }
    }

    // Extract options with defaults
    const {
      maxPerType = DEFAULT_MAX_PER_TYPE,
      maxTotal = DEFAULT_MAX_TOTAL,
      includeTypes,
      excludeTypes,
      excludeIds = [],
      weights, // Don't default - let algorithm choose appropriate weights
    } = options;

    // Try to load pre-computed related content first
    const contentKey = `${sourceType}:${actualSourceId}`;
    const precomputed = await readJsonS3<
      Record<
        string,
        {
          type: RelatedContentType;
          id: string;
          score: number;
          title: string;
        }[]
      >
    >(CONTENT_GRAPH_S3_PATHS.RELATED_CONTENT);

    if (precomputed?.[contentKey]) {
      // Use pre-computed scores
      let items = precomputed[contentKey];

      // Apply filters
      if (includeTypes) {
        const inc = new Set(includeTypes);
        items = items.filter(item => inc.has(item.type));
      }
      if (excludeTypes) {
        const exc = new Set(excludeTypes);
        items = items.filter(item => !exc.has(item.type));
      }
      if (excludeIds.length > 0) {
        items = items.filter(item => !excludeIds.includes(item.id));
      }

      // Apply limits via shared helper
      const limited = limitByTypeAndTotal(items, maxPerType, maxTotal);

      // Get all content for mapping
      // Use lazy loading to reduce memory pressure
      const neededTypes = Array.from(new Set(limited.map(item => item.type)));
      const contentMap = await getLazyContentMap(neededTypes);

      // Get slug mappings for bookmarks using request cache
      let slugMap: Map<string, string> | undefined;
      if (limited.some(item => item.type === "bookmark")) {
        const { slugMap: map } = await getCachedBookmarksWithSlugs();
        slugMap = map;
      }

      // Convert to RelatedContentItem format
      const relatedItems = limited
        .map(item => {
          const content = contentMap.get(`${item.type}:${item.id}`);
          if (!content) return null;
          const relatedItem = toRelatedContentItem({ ...content, score: item.score }, slugMap);
          if (!relatedItem) {
            console.warn(`[RelatedContent] Skipping item ${item.type}:${item.id} due to missing slug`);
          }
          return relatedItem;
        })
        .filter((i): i is RelatedContentItem => i !== null);

      if (relatedItems.length > 0) {
        return <RelatedContentSection title={sectionTitle} items={relatedItems} className={className} />;
      }
    }

    // Check cache first
    const getRelatedContent = ServerCacheInstance.getRelatedContent;
    let cached: RelatedContentCacheData | undefined;
    if (getRelatedContent && typeof getRelatedContent === "function") {
      cached = getRelatedContent.call(ServerCacheInstance, sourceType, actualSourceId);
    }
    if (cached && cached.timestamp > Date.now() - 15 * 60 * 1000 && !debug) {
      // Apply filtering to cached results
      let items = cached.items;

      if (includeTypes || excludeTypes) {
        items = filterByTypes(
          items,
          includeTypes ? Array.from(new Set(includeTypes)) : undefined,
          excludeTypes ? Array.from(new Set(excludeTypes)) : undefined,
        );
      }

      // Apply limits via shared helper
      const finalItems = limitByTypeAndTotal(items, maxPerType, maxTotal);

      // Get pre-computed slug mappings for bookmarks using request cache
      let slugMap: Map<string, string> | undefined;
      if (finalItems.some(item => item.type === "bookmark")) {
        const { slugMap: map } = await getCachedBookmarksWithSlugs();
        slugMap = map;
      }

      const relatedItems = finalItems
        .map(item => {
          const relatedItem = toRelatedContentItem(item, slugMap);
          if (!relatedItem && item.type === "bookmark") {
            console.warn(`[RelatedContent] Skipping bookmark ${item.id} due to missing slug`);
          }
          return relatedItem;
        })
        .filter((i): i is RelatedContentItem => i !== null);

      if (relatedItems.length === 0) {
        return null;
      }
      return <RelatedContentSection title={sectionTitle} items={relatedItems} className={className} />;
    }

    // Get source content
    const source = await getContentById(sourceType, actualSourceId);
    if (!source) {
      console.error(`Content not found: ${sourceType}/${actualSourceId}`);
      return null;
    }

    // Get all content using cached version to reduce redundant fetches
    let allContent = await getCachedAllContent();

    // Filter by include/exclude types
    if (includeTypes || excludeTypes) {
      allContent = filterByTypes(
        allContent,
        includeTypes ? Array.from(new Set(includeTypes)) : undefined,
        excludeTypes ? Array.from(new Set(excludeTypes)) : undefined,
      );
    }

    // Exclude the source item and any specified IDs
    const allExcludeIds = new Set([...excludeIds, actualSourceId]);

    const candidates = allContent.filter(item => !(item.type === sourceType && allExcludeIds.has(item.id)));

    // Find similar content
    const similar = findMostSimilar(source, candidates, maxTotal * 2, weights);

    // Apply limits via shared helper
    const finalItems = limitByTypeAndTotal(similar, maxPerType, maxTotal);

    // Cache the results
    const setRelatedContent = ServerCacheInstance.setRelatedContent;
    if (setRelatedContent && typeof setRelatedContent === "function") {
      setRelatedContent.call(ServerCacheInstance, sourceType, actualSourceId, {
        items: finalItems,
        timestamp: Date.now(),
      });
    }

    // Get pre-computed slug mappings for bookmarks using request cache
    let slugMap: Map<string, string> | undefined;
    if (finalItems.some(item => item.type === "bookmark")) {
      const { slugMap: map } = await getCachedBookmarksWithSlugs();
      slugMap = map;
    }

    // Convert to RelatedContentItem format
    const relatedItems = finalItems
      .map(item => {
        const relatedItem = toRelatedContentItem(item, slugMap);
        if (!relatedItem && item.type === "bookmark") {
          console.warn(`[RelatedContent] Skipping bookmark ${item.id} due to missing slug`);
        }
        return relatedItem;
      })
      .filter((i): i is RelatedContentItem => i !== null);

    // Return nothing if no related items found
    if (relatedItems.length === 0) {
      return null;
    }

    return <RelatedContentSection title={sectionTitle} items={relatedItems} className={className} />;
  } catch (error) {
    console.error("Error fetching related content:", error);
    return null;
  }
}
