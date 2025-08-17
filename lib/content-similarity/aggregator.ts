/**
 * Content Aggregator
 * 
 * Fetches and normalizes content from all data sources (bookmarks, blog, investments, projects)
 * for similarity comparison and recommendation generation.
 */

import { getBookmarks } from "@/lib/bookmarks/service.server";
import { getAllPosts } from "@/lib/blog";
import { investments } from "@/data/investments";
import { projects } from "@/data/projects";
import { ServerCacheInstance } from "@/lib/server-cache";
import { extractKeywords, extractCrossContentKeywords } from "./keyword-extractor";
import { extractDomain } from "@/lib/utils";
import type {
  NormalizedContent,
  RelatedContentType,
  ContentSource,
} from "@/types/related-content";
import type { UnifiedBookmark } from "@/types/bookmark";
import type { BlogPost } from "@/types/blog";
import type { Investment } from "@/types/investment";
import type { Project } from "@/types/project";

const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

/**
 * Parse date string to Date object
 */
function parseDate(dateStr?: string | null): Date | undefined {
  if (!dateStr) return undefined;
  try {
    const date = new Date(dateStr);
    return Number.isNaN(date.getTime()) ? undefined : date;
  } catch {
    return undefined;
  }
}

/**
 * Normalize a bookmark for similarity comparison
 */
function normalizeBookmark(bookmark: UnifiedBookmark): NormalizedContent {
  // Extract tags (known schema) and de-duplicate
  const tags = Array.isArray(bookmark.tags)
    ? Array.from(
        new Set(
          bookmark.tags
            .map((t) => t?.name)
            .filter((name): name is string => Boolean(name && name.trim()))
        )
      )
    : [];
  
  // Build text content for similarity matching
  const textParts = [
    bookmark.description,
    bookmark.note,
    bookmark.summary,
    bookmark.ogDescription,
  ].filter(Boolean);
  
  const text = textParts.join(" ");
  const title = bookmark.title || "Untitled";
  
  // Extract keywords to supplement tags
  const keywords = extractKeywords(title, text, tags, 8);
  const enhancedTags = [...tags, ...keywords];
  
  return {
    id: bookmark.id,
    type: "bookmark",
    title,
    text,
    tags: enhancedTags,
    // Note: URL will be resolved to actual slug in RelatedContent component
    // We can't generate slugs here as it requires all bookmarks for uniqueness
    url: `/bookmarks/${bookmark.id}`, // Placeholder - actual slug resolved later
    domain: extractDomain(bookmark.url),
    date: parseDate(bookmark.dateBookmarked),
    source: bookmark,
  };
}

/**
 * Normalize a blog post for similarity comparison
 */
function normalizeBlogPost(post: BlogPost): NormalizedContent {
  // Build text content
  const textParts = [
    post.excerpt,
    post.rawContent?.slice(0, 500), // Use first 500 chars of raw content
  ].filter(Boolean);
  
  const text = textParts.join(" ");
  const tags = post.tags || [];
  
  // Extract keywords to supplement tags
  const keywords = extractKeywords(post.title, text, tags, 8);
  const enhancedTags = [...tags, ...keywords];
  
  return {
    id: post.id,
    type: "blog",
    title: post.title,
    text,
    tags: enhancedTags,
    url: `/blog/${post.slug}`,
    domain: undefined,
    date: parseDate(post.publishedAt),
    source: post,
  };
}

/**
 * Normalize an investment for similarity comparison
 */
function normalizeInvestment(investment: Investment): NormalizedContent {
  // Build tags from category and stage
  const tags: string[] = [];
  if (investment.category) tags.push(investment.category);
  if (investment.stage) tags.push(investment.stage);
  if (investment.status) tags.push(investment.status);
  
  // Add accelerator tags
  if (investment.accelerator) {
    if (Array.isArray(investment.accelerator)) {
      investment.accelerator.forEach(acc => {
        if (acc && typeof acc === "object" && "name" in acc) {
          const accObj = acc as { name: string };
          tags.push(accObj.name);
        }
      });
    } else if (typeof investment.accelerator === "object" && "name" in investment.accelerator) {
      const accObj = investment.accelerator as { name: string };
      tags.push(accObj.name);
    }
  }
  
  // Extract cross-content keywords for better matching
  const keywords = extractCrossContentKeywords(
    investment.name,
    investment.description,
    investment.category,
    investment.stage
  );
  
  // Combine tags with keywords
  const enhancedTags = [...tags, ...keywords].filter((tag, index, self) => 
    self.indexOf(tag) === index // Remove duplicates
  );
  
  return {
    id: investment.id,
    type: "investment",
    title: investment.name,
    text: investment.description,
    tags: enhancedTags,
    url: `/investments#${investment.id}`,
    domain: extractDomain(investment.website || ""),
    date: investment.invested_year ? new Date(`${investment.invested_year}-01-01`) : undefined,
    source: investment,
  };
}

/**
 * Normalize a project for similarity comparison
 */
function normalizeProject(project: Project): NormalizedContent {
  const text = `${project.description} ${project.shortSummary}`;
  const tags = project.tags || [];
  
  // Extract keywords to supplement tags
  const keywords = extractKeywords(project.name, text, tags, 8);
  const enhancedTags = [...tags, ...keywords];
  
  return {
    id: project.id || project.name,
    type: "project",
    title: project.name,
    text,
    tags: enhancedTags,
    url: `/projects#${project.id || project.name}`,
    domain: extractDomain(project.url),
    date: undefined, // Projects don't have dates in current schema
    source: project,
  };
}

/**
 * Fetch and normalize all content from all sources
 */
export async function aggregateAllContent(): Promise<NormalizedContent[]> {
  // Check cache first
  const getAggregatedContent = ServerCacheInstance.getAggregatedContent;
  if (getAggregatedContent && typeof getAggregatedContent === 'function') {
    const cached = getAggregatedContent.call(ServerCacheInstance);
    if (cached && cached.timestamp > Date.now() - CACHE_TTL) {
      return cached.data;
    }
  }
  
  try {
    // Fetch all content in parallel
    const [bookmarksData, blogPosts] = await Promise.all([
      getBookmarks({ includeImageData: false }),
      getAllPosts(),
    ]);
    
    // Normalize all content
    const normalized: NormalizedContent[] = [];
    
    // Process bookmarks
    if (bookmarksData && Array.isArray(bookmarksData)) {
      const bookmarks = bookmarksData as UnifiedBookmark[];
      bookmarks.forEach(bookmark => {
        try {
          normalized.push(normalizeBookmark(bookmark));
        } catch (error) {
          console.error(`Failed to normalize bookmark ${bookmark.id}:`, error);
        }
      });
    }
    
    // Process blog posts
    if (blogPosts && Array.isArray(blogPosts)) {
      blogPosts.forEach(post => {
        try {
          normalized.push(normalizeBlogPost(post));
        } catch (error) {
          console.error(`Failed to normalize blog post ${post.id}:`, error);
        }
      });
    }
    
    // Process investments (static data)
    investments.forEach(investment => {
      try {
        normalized.push(normalizeInvestment(investment));
      } catch (error) {
        console.error(`Failed to normalize investment ${investment.id}:`, error);
      }
    });
    
    // Process projects (static data)
    projects.forEach(project => {
      try {
        normalized.push(normalizeProject(project));
      } catch (error) {
        console.error(`Failed to normalize project ${project.name}:`, error);
      }
    });
    
    // Cache the results
    const setAggregatedContent = ServerCacheInstance.setAggregatedContent;
    if (setAggregatedContent && typeof setAggregatedContent === 'function') {
      setAggregatedContent.call(ServerCacheInstance, {
        data: normalized,
        timestamp: Date.now(),
      });
    }
    
    return normalized;
  } catch (error) {
    console.error("Failed to aggregate content:", error);
    // Return empty array on error
    return [];
  }
}

/**
 * Get content by type and ID
 */
export async function getContentById(
  type: RelatedContentType,
  id: string
): Promise<NormalizedContent | null> {
  const allContent = await aggregateAllContent();
  return allContent.find(item => item.type === type && item.id === id) || null;
}

/**
 * Filter content by types
 */
export function filterByTypes<T extends NormalizedContent>(
  content: T[],
  includeTypes?: RelatedContentType[],
  excludeTypes?: RelatedContentType[]
): T[] {
  let filtered = content;
  
  if (includeTypes && includeTypes.length > 0) {
    filtered = filtered.filter(item => includeTypes.includes(item.type)) as typeof filtered;
  }
  
  if (excludeTypes && excludeTypes.length > 0) {
    filtered = filtered.filter(item => !excludeTypes.includes(item.type)) as typeof filtered;
  }
  
  return filtered;
}