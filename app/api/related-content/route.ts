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
import { generateUniqueSlug } from "@/lib/utils/domain-utils";
import type {
  RelatedContentResponse,
  RelatedContentItem,
  RelatedContentType,
  SimilarityWeights,
  NormalizedContent,
  RelatedContentCacheData,
} from "@/types/related-content";
import type { UnifiedBookmark } from "@/types/bookmark";

// Default options
const DEFAULT_MAX_PER_TYPE = 3;
const DEFAULT_MAX_TOTAL = 12;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

/**
 * Convert normalized content to related content item
 */
function toRelatedContentItem(
  content: NormalizedContent & { score: number },
  allBookmarks?: UnifiedBookmark[]
): RelatedContentItem {
  const metadata: RelatedContentItem["metadata"] = {
    tags: content.tags,
    domain: content.domain,
    date: content.date?.toISOString(),
  };
  
  // Add type-specific metadata
  switch (content.type) {
    case "bookmark": {
      const bookmark = content.source as UnifiedBookmark;
      // Generate the correct slug-based URL
      let url = `/bookmarks/${content.id}`;
      if (allBookmarks) {
        const slug = generateUniqueSlug(bookmark.url, allBookmarks, bookmark.id);
        url = `/bookmarks/${slug}`;
      }
      
      metadata.imageUrl = bookmark.ogImage || bookmark.content?.imageUrl;
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
      metadata.readingTime = blog.readingTime;
      metadata.imageUrl = blog.coverImage;
      metadata.author = blog.author ? {
        name: blog.author.name,
        avatar: blog.author.avatar,
      } : undefined;
      
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
      metadata.stage = investment.stage;
      metadata.category = investment.category;
      metadata.imageUrl = investment.logo || undefined;
      
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
      if (project.imageKey) {
        metadata.imageUrl = `/api/s3/${project.imageKey}`;
      }
      
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
        metadata,
      };
  }
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const sourceType = searchParams.get("type") as RelatedContentType | null;
    const sourceId = searchParams.get("id");
    
    if (!sourceType || !sourceId) {
      return NextResponse.json(
        { error: "Missing required parameters: type and id" },
        { status: 400 }
      );
    }
    
    // Parse optional parameters
    const maxPerType = parseInt(searchParams.get("maxPerType") || String(DEFAULT_MAX_PER_TYPE), 10);
    const maxTotal = parseInt(searchParams.get("maxTotal") || String(DEFAULT_MAX_TOTAL), 10);
    const includeTypes = searchParams.get("includeTypes")?.split(",") as RelatedContentType[] | undefined;
    const excludeTypes = searchParams.get("excludeTypes")?.split(",") as RelatedContentType[] | undefined;
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
    const getRelatedContent = ServerCacheInstance.getRelatedContent;
    let cached: RelatedContentCacheData | undefined;
    if (getRelatedContent && typeof getRelatedContent === 'function') {
      cached = getRelatedContent.call(ServerCacheInstance, sourceType, sourceId);
    }
    if (cached && cached.timestamp > Date.now() - CACHE_TTL && !debug) {
      // Apply filtering to cached results
      let items = cached.items;
      
      if (includeTypes || excludeTypes) {
        items = filterByTypes(items, includeTypes, excludeTypes) as typeof items;
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
      
      // Get all bookmarks for slug generation if needed
      let allBookmarks: UnifiedBookmark[] | undefined;
      if (finalItems.some(item => item.type === "bookmark")) {
        const { getBookmarks } = await import("@/lib/bookmarks/service.server");
        allBookmarks = await getBookmarks({ includeImageData: false }) as UnifiedBookmark[];
      }
      
      const response: RelatedContentResponse = {
        items: finalItems.map(item => toRelatedContentItem(item, allBookmarks)),
        totalFound: cached.items.length,
        meta: {
          computeTime: Date.now() - startTime,
          cached: true,
          cacheTTL: Math.floor((cached.timestamp + CACHE_TTL - Date.now()) / 1000),
        },
      };
      
      return NextResponse.json(response);
    }
    
    // Get source content
    const source = await getContentById(sourceType, sourceId);
    if (!source) {
      return NextResponse.json(
        { error: `Content not found: ${sourceType}/${sourceId}` },
        { status: 404 }
      );
    }
    
    // Get all content
    let allContent = await aggregateAllContent();
    
    // Filter by include/exclude types
    if (includeTypes || excludeTypes) {
      allContent = filterByTypes(allContent, includeTypes, excludeTypes);
    }
    
    // Exclude the source item and any specified IDs
    const excludeIds = searchParams.get("excludeIds")?.split(",") || [];
    excludeIds.push(sourceId);
    
    const candidates = allContent.filter(
      item => !(item.type === sourceType && excludeIds.includes(item.id))
    );
    
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
    const finalItems = limited
      .sort((a, b) => b.score - a.score)
      .slice(0, maxTotal);
    
    // Cache the results
    const setRelatedContent = ServerCacheInstance.setRelatedContent;
    if (setRelatedContent && typeof setRelatedContent === 'function') {
      setRelatedContent.call(ServerCacheInstance, sourceType, sourceId, {
        items: finalItems,
        timestamp: Date.now(),
      });
    }
    
    // Get all bookmarks for slug generation if needed
    let allBookmarks: UnifiedBookmark[] | undefined;
    if (finalItems.some(item => item.type === "bookmark")) {
      const { getBookmarks } = await import("@/lib/bookmarks/service.server");
      allBookmarks = await getBookmarks({ includeImageData: false }) as UnifiedBookmark[];
    }
    
    // Build response
    const response: RelatedContentResponse = {
      items: finalItems.map(item => toRelatedContentItem(item, allBookmarks)),
      totalFound: similar.length,
      meta: {
        computeTime: Date.now() - startTime,
        cached: false,
        cacheTTL: Math.floor(CACHE_TTL / 1000),
      },
    };
    
    // Add debug information if requested
    if (debug) {
      response.debug = {
        scores: finalItems.reduce((acc, item) => {
          acc[`${item.type}:${item.id}`] = item.breakdown;
          return acc;
        }, {} as Record<string, Record<keyof SimilarityWeights, number>>),
        sourceContent: {
          type: source.type,
          id: source.id,
          tags: source.tags,
          text: source.text.slice(0, 200) + "...",
        },
      };
    }
    
    return NextResponse.json(response);
  } catch (error) {
    console.error("Error in related content API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}