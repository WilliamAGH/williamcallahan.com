/**
 * Related Content API Endpoint
 *
 * Returns related/suggested content for a given source content item
 * using similarity scoring across bookmarks, blog posts, investments, and projects.
 */

import { NextRequest, NextResponse } from "next/server";
import { aggregateAllContent, getContentById, filterByTypes } from "@/lib/content-similarity/aggregator";
import { findMostSimilar, groupByType, DEFAULT_WEIGHTS } from "@/lib/content-similarity";
import { ServerCacheInstance } from "@/lib/server-cache";
import { loadSlugMapping } from "@/lib/bookmarks/slug-manager";
import { requestLock } from "@/lib/server/request-lock";
import type {
  RelatedContentItem,
  RelatedContentType,
  SimilarityWeights,
  NormalizedContent,
} from "@/types/related-content";
import type { UnifiedBookmark, BookmarkSlugMapping } from "@/types/bookmark";

// Default options
const DEFAULT_MAX_PER_TYPE = 3;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

/**
 * Convert normalized content to related content item
 */
function toRelatedContentItem(
  content: NormalizedContent & { score: number },
  slugMapping: BookmarkSlugMapping | null,
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
      // Use pre-computed slug for URL
      let url = `/bookmarks/${content.id}`; // Fallback
      if (slugMapping) {
        const slug = slugMapping.slugs[content.id]?.slug;
        if (slug) {
          url = `/bookmarks/${slug}`;
        }
      }
      const metadata: RelatedContentItem["metadata"] = {
        ...baseMetadata,
        imageUrl: bookmark.ogImage || bookmark.content?.imageUrl,
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
        imageUrl: blog.coverImage,
        author: blog.author ? { name: blog.author.name, avatar: blog.author.avatar } : undefined,
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
        imageUrl: investment.logo || undefined,
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
      // Use S3 image key to construct URL
      const metadata: RelatedContentItem["metadata"] = project.imageKey
        ? { ...baseMetadata, imageUrl: `/api/s3/${project.imageKey}` }
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

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const sourceTypeRaw = searchParams.get("type");
    const allowedTypes = new Set<RelatedContentType>(["bookmark", "blog", "investment", "project"]);
    const sourceType = allowedTypes.has(sourceTypeRaw as RelatedContentType)
      ? (sourceTypeRaw as RelatedContentType)
      : null;
    const sourceId = searchParams.get("id");

    if (!sourceType || !sourceId) {
      return NextResponse.json({ error: "Missing required parameters: type and id" }, { status: 400 });
    }

    const lockKey = `related-content:${sourceType}:${sourceId}`;

    // Parse optional parameters
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const maxPerType = parseInt(searchParams.get("maxPerType") || String(DEFAULT_MAX_PER_TYPE), 10);
    const parseTypesParam = (value: string | null): RelatedContentType[] | undefined => {
      if (!value) return undefined;
      const allowed: RelatedContentType[] = ["bookmark", "blog", "investment", "project"];
      const set = new Set(allowed);
      const parsed = value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((t): t is RelatedContentType => set.has(t as RelatedContentType));
      return parsed.length ? parsed : undefined;
    };
    const includeTypes = parseTypesParam(searchParams.get("includeTypes"));
    const excludeTypes = parseTypesParam(searchParams.get("excludeTypes"));
    const debug = searchParams.get("debug") === "true";

    // Parse custom weights if provided
    let weights = DEFAULT_WEIGHTS;
    const customWeights = searchParams.get("weights");
    if (customWeights) {
      try {
        const parsed = JSON.parse(customWeights) as Partial<SimilarityWeights>;
        weights = { ...DEFAULT_WEIGHTS, ...parsed };
      } catch {
        // Use default weights if parsing fails
      }
    }

    // Check cache first
    let cached = ServerCacheInstance.getRelatedContent(sourceType, sourceId);

    // If cache is stale or missing, compute it (with a lock)
    if (!cached || cached.timestamp <= Date.now() - CACHE_TTL || debug) {
      await requestLock.run({
        key: lockKey,
        work: async () => {
          const source = await getContentById(sourceType, sourceId);
          if (!source) {
            return;
          }

          let allContent = await aggregateAllContent();

          if (includeTypes || excludeTypes) {
            allContent = filterByTypes(allContent, includeTypes, excludeTypes);
          }

          const excludeIds = searchParams.get("excludeIds")?.split(",") || [];
          excludeIds.push(sourceId);

          const candidates = allContent.filter((item) => !(item.type === sourceType && excludeIds.includes(item.id)));

          // Get a large number of similar items to allow for pagination
          const similar = findMostSimilar(source, candidates, 100, weights);

          ServerCacheInstance.setRelatedContent(sourceType, sourceId, {
            items: similar,
            timestamp: Date.now(),
          });
        },
      });

      cached = ServerCacheInstance.getRelatedContent(sourceType, sourceId);
    }

    if (!cached) {
      return NextResponse.json(
        { error: `Content not found or failed to compute: ${sourceType}/${sourceId}` },
        { status: 404 },
      );
    }

    // Apply filtering to cached results
    const cachedData = cached;
    let items = cachedData.items;

    if (includeTypes || excludeTypes) {
      items = filterByTypes(items, includeTypes, excludeTypes);
    }

    // Apply per-type limits
    const grouped = groupByType(items);
    const limited: typeof items = [];

    for (const [, typeItems] of Object.entries(grouped)) {
      if (typeItems) {
        const limitedTypeItems = typeItems.slice(0, maxPerType);
        limited.push(...limitedTypeItems);
      }
    }

    const sortedItems = limited.sort((a, b) => b.score - a.score);

    // Apply pagination
    const totalItems = sortedItems.length;
    const totalPages = Math.ceil(totalItems / limit);
    const paginatedItems = sortedItems.slice((page - 1) * limit, page * limit);

    // Get slug mapping if needed for bookmark URLs
    let slugMapping: BookmarkSlugMapping | null = null;
    if (paginatedItems.some((item) => item.type === "bookmark")) {
      slugMapping = await loadSlugMapping();
    }

    const responseData = paginatedItems.map((item) => toRelatedContentItem(item, slugMapping));

    const response = {
      data: responseData,
      meta: {
        pagination: {
          total: totalItems,
          totalPages,
          page,
          limit,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
        computeTime: Date.now() - startTime,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error in related content API:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
