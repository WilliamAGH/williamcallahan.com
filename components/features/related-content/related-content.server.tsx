/**
 * RelatedContent Server Component
 *
 * Fetches and displays related content recommendations for a given source item.
 * Uses server-side rendering for optimal performance and SEO.
 */

import { aggregateAllContent, getContentById, filterByTypes } from "@/lib/content-similarity/aggregator";
import { findMostSimilar, groupByType, DEFAULT_WEIGHTS } from "@/lib/content-similarity";
import { ServerCacheInstance } from "@/lib/server-cache";
import { RelatedContentSection } from "./related-content-section";
import { ensureAbsoluteUrl } from "@/lib/seo/utils";
import { getBulkBookmarkSlugs } from "@/lib/bookmarks/slug-helpers";
import { readJsonS3 } from "@/lib/s3-utils";
import { CONTENT_GRAPH_S3_PATHS } from "@/lib/constants";
import type {
  RelatedContentProps,
  RelatedContentItem,
  RelatedContentType,
  NormalizedContent,
  RelatedContentCacheData,
} from "@/types/related-content";
import type { UnifiedBookmark } from "@/types/bookmark";

// Default options
const DEFAULT_MAX_PER_TYPE = 3;
const DEFAULT_MAX_TOTAL = 12;

/**
 * Convert normalized content to related content item
 */
function toRelatedContentItem(
  content: NormalizedContent & { score: number },
  slugMap?: Map<string, string>,
): RelatedContentItem {
  const baseMetadata: RelatedContentItem["metadata"] = {
    tags: content.tags,
    domain: content.domain,
    date: content.date?.toISOString(),
  };

  // Add type-specific metadata
  switch (content.type) {
    case "bookmark": {
      const bookmark = content.source as UnifiedBookmark;
      // Use pre-computed slug from mapping
      const slug = slugMap?.get(bookmark.id) || content.id;
      const url = `/bookmarks/${slug}`;
      const metadata: RelatedContentItem["metadata"] = {
        ...baseMetadata,
        imageUrl: bookmark.ogImage
          ? ensureAbsoluteUrl(bookmark.ogImage)
          : bookmark.content?.imageUrl
            ? ensureAbsoluteUrl(bookmark.content.imageUrl)
            : undefined,
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
      // Use S3 image key to construct absolute URL
      const metadata: RelatedContentItem["metadata"] = project.imageKey
        ? { ...baseMetadata, imageUrl: ensureAbsoluteUrl(`/api/s3/${project.imageKey}`) }
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
  sectionTitle = "Related Content",
  options = {},
  className,
}: RelatedContentProps) {
  try {
    // Extract options with defaults
    const {
      maxPerType = DEFAULT_MAX_PER_TYPE,
      maxTotal = DEFAULT_MAX_TOTAL,
      includeTypes,
      excludeTypes,
      excludeIds = [],
      weights = DEFAULT_WEIGHTS,
      debug = false,
    } = options;

    // Try to load pre-computed related content first
    const contentKey = `${sourceType}:${sourceId}`;
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
        const inc = [...includeTypes];
        items = items.filter((item) => inc.includes(item.type));
      }
      if (excludeTypes) {
        const exc = [...excludeTypes];
        items = items.filter((item) => !exc.includes(item.type));
      }
      if (excludeIds.length > 0) {
        items = items.filter((item) => !excludeIds.includes(item.id));
      }

      // Apply limits
      const grouped = items.reduce(
        (acc, item) => {
          if (!acc[item.type]) acc[item.type] = [];
          const typeItems = acc[item.type];
          if (typeItems && typeItems.length < maxPerType) {
            typeItems.push(item);
          }
          return acc;
        },
        {} as Record<string, typeof items>,
      );

      const limited = Object.values(grouped).flat().slice(0, maxTotal);

      // Get all content for mapping
      const allContent = await aggregateAllContent();
      const contentMap = new Map(allContent.map((c) => [`${c.type}:${c.id}`, c]));

      // Get slug mappings for bookmarks
      let slugMap: Map<string, string> | undefined;
      if (limited.some((item) => item.type === "bookmark")) {
        const { getBookmarks } = await import("@/lib/bookmarks/service.server");
        const allBookmarks = (await getBookmarks({ includeImageData: false })) as UnifiedBookmark[];
        slugMap = await getBulkBookmarkSlugs(allBookmarks);
      }

      // Convert to RelatedContentItem format
      const relatedItems = limited
        .map((item) => {
          const content = contentMap.get(`${item.type}:${item.id}`);
          if (!content) return null;
          return toRelatedContentItem({ ...content, score: item.score }, slugMap);
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
      cached = getRelatedContent.call(ServerCacheInstance, sourceType, sourceId);
    }
    if (cached && cached.timestamp > Date.now() - 15 * 60 * 1000 && !debug) {
      // Apply filtering to cached results
      let items = cached.items;

      if (includeTypes || excludeTypes) {
        items = filterByTypes(
          items,
          includeTypes ? [...includeTypes] : undefined,
          excludeTypes ? [...excludeTypes] : undefined,
        );
      }

      // Apply limits
      const grouped = groupByType(items);
      const limited: typeof items = [];

      for (const [, typeItems] of Object.entries(grouped)) {
        if (typeItems) {
          const limitedTypeItems = typeItems.slice(0, maxPerType);
          limited.push(...limitedTypeItems);
        }
      }

      const finalItems = limited.slice(0, maxTotal);

      // Get pre-computed slug mappings for bookmarks if needed
      let slugMap: Map<string, string> | undefined;
      if (finalItems.some((item) => item.type === "bookmark")) {
        const { getBookmarks } = await import("@/lib/bookmarks/service.server");
        const allBookmarks = (await getBookmarks({ includeImageData: false })) as UnifiedBookmark[];
        slugMap = await getBulkBookmarkSlugs(allBookmarks);
      }

      const relatedItems = finalItems.map((item) => toRelatedContentItem(item, slugMap));

      return <RelatedContentSection title={sectionTitle} items={relatedItems} className={className} />;
    }

    // Get source content
    const source = await getContentById(sourceType, sourceId);
    if (!source) {
      console.error(`Content not found: ${sourceType}/${sourceId}`);
      return null;
    }

    // Get all content
    let allContent = await aggregateAllContent();

    // Filter by include/exclude types
    if (includeTypes || excludeTypes) {
      allContent = filterByTypes(
        allContent,
        includeTypes ? [...includeTypes] : undefined,
        excludeTypes ? [...excludeTypes] : undefined,
      );
    }

    // Exclude the source item and any specified IDs
    const allExcludeIds = [...excludeIds, sourceId];

    const candidates = allContent.filter((item) => !(item.type === sourceType && allExcludeIds.includes(item.id)));

    // Find similar content
    const similar = findMostSimilar(source, candidates, maxTotal * 2, weights);

    // Group by type and apply per-type limits
    const grouped = groupByType(similar);
    const limited: typeof similar = [];

    for (const [, typeItems] of Object.entries(grouped)) {
      if (typeItems) {
        const limitedTypeItems = typeItems.slice(0, maxPerType);
        limited.push(...limitedTypeItems);
      }
    }

    // Apply total limit and sort by score
    const finalItems = limited.sort((a, b) => b.score - a.score).slice(0, maxTotal);

    // Cache the results
    const setRelatedContent = ServerCacheInstance.setRelatedContent;
    if (setRelatedContent && typeof setRelatedContent === "function") {
      setRelatedContent.call(ServerCacheInstance, sourceType, sourceId, {
        items: finalItems,
        timestamp: Date.now(),
      });
    }

    // Get pre-computed slug mappings for bookmarks if needed
    let slugMap: Map<string, string> | undefined;
    if (finalItems.some((item) => item.type === "bookmark")) {
      const { getBookmarks } = await import("@/lib/bookmarks/service.server");
      const allBookmarks = (await getBookmarks({ includeImageData: false })) as UnifiedBookmark[];
      slugMap = await getBulkBookmarkSlugs(allBookmarks);
    }

    // Convert to RelatedContentItem format
    const relatedItems = finalItems.map((item) => toRelatedContentItem(item, slugMap));

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
