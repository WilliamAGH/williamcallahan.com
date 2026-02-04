/**
 * Dynamic Content Retriever for RAG
 *
 * Performs query-time search using existing search functions.
 * Detects relevant scopes from query keywords and retrieves matching content.
 *
 * @module lib/ai/rag/dynamic-retriever
 */

import type { DynamicResult } from "./context-formatter";
import {
  searchProjects,
  searchInvestments,
  searchExperience,
  searchEducation,
} from "@/lib/search/searchers/static-searchers";
import { searchBlogPostsServerSide } from "@/lib/blog/server-search";
import { searchBooks, searchBookmarks } from "@/lib/search/searchers/dynamic-searchers";
import { searchTags } from "@/lib/search/searchers/tag-search";
import { searchAiAnalysis } from "@/lib/search/searchers/ai-analysis-searcher";
import logger from "@/lib/utils/logger";

/**
 * Valid scope names for RAG content retrieval.
 * This type ensures SCOPE_PATTERNS and SCOPE_SEARCHERS have matching keys.
 */
type ScopeName =
  | "projects"
  | "blog"
  | "investments"
  | "experience"
  | "education"
  | "books"
  | "bookmarks"
  | "tags"
  | "analysis";

/**
 * Scope detection patterns.
 * Each scope has keywords that trigger searching that content type.
 */
const SCOPE_PATTERNS: Record<ScopeName, RegExp> = {
  projects: /\b(projects?|built|apps?|tools?|software|code|github|develop|create)\b/i,
  blog: /\b(blog|articles?|wrote|write|posts?)\b/i,
  investments: /\b(invest|portfolio|startups?|fund|venture|vc|backed|seed)\b/i,
  experience: /\b(work|jobs?|roles?|experience|employ|company|career|position)\b/i,
  education: /\b(education|degrees?|certs?|certif|school|university|learn|study|cfa|cfp|mba)\b/i,
  books: /\b(books?|reading|read|authors?|library|shelf)\b/i,
  bookmarks: /\b(bookmarks?|bookmarked|links?|resources?|saved?|favorites?)\b/i,
  tags: /\b(tags?|topics?|categories|subjects?|themes?|writes?\s+about)\b/i,
  analysis: /\b(analysis|summary|summaries|insight|overview|highlights?|ai\s*generated|themes?)\b/i,
};

/**
 * Detects which content scopes are relevant to a query.
 * Returns an array of typed scope names to search.
 */
function detectRelevantScopes(query: string): ScopeName[] {
  const scopes: ScopeName[] = [];

  for (const [scope, pattern] of Object.entries(SCOPE_PATTERNS) as [ScopeName, RegExp][]) {
    if (pattern.test(query)) {
      scopes.push(scope);
    }
  }

  return scopes;
}

/**
 * Search function type for scope searchers.
 */
type ScopeSearcher = (
  query: string,
) => Promise<Array<{ title: string; description?: string; url: string; score: number }>>;

/**
 * Search function mapping for each scope.
 * Uses ScopeName type to ensure keys match SCOPE_PATTERNS.
 */
const SCOPE_SEARCHERS: Record<ScopeName, ScopeSearcher> = {
  projects: searchProjects,
  blog: searchBlogPostsServerSide,
  investments: searchInvestments,
  experience: searchExperience,
  education: searchEducation,
  books: searchBooks,
  bookmarks: searchBookmarks,
  tags: searchTags,
  analysis: searchAiAnalysis,
};

export interface RetrieveOptions {
  maxResults?: number;
  timeoutMs?: number;
}

/**
 * Result type that includes status metadata for caller awareness (per [RC1]).
 * Callers can distinguish between "no matches found" vs "error during retrieval".
 */
export interface RetrieveResult {
  results: DynamicResult[];
  status: "success" | "partial" | "failed";
  /** Scopes that failed during retrieval (for debugging) */
  failedScopes?: string[];
}

/**
 * Retrieves content relevant to a user query.
 * Detects scopes from query keywords and runs appropriate searches.
 *
 * @param query - The user's query text
 * @param options - Optional settings for max results and timeout
 * @returns Result object with search results and status metadata (per [RC1]: no silent degradation)
 */
export async function retrieveRelevantContent(
  query: string,
  options?: RetrieveOptions,
): Promise<RetrieveResult> {
  const maxResults = options?.maxResults ?? 5;
  const timeoutMs = options?.timeoutMs ?? 3000;

  const scopes = detectRelevantScopes(query);

  // If no scopes detected, skip dynamic retrieval
  if (scopes.length === 0) {
    return { results: [], status: "success" };
  }

  // Track failed scopes for caller awareness
  const failedScopes: string[] = [];

  // Create a timeout promise
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    setTimeout(() => reject(new Error("Search timeout")), timeoutMs);
  });

  // Run searches for detected scopes in parallel
  const searchPromises = scopes.map(async (scope) => {
    const searcher = SCOPE_SEARCHERS[scope];
    if (!searcher) {
      logger.warn(`[RAG] No searcher registered for scope: ${scope}`);
      failedScopes.push(scope);
      return [];
    }

    try {
      const results = await searcher(query);
      return results.slice(0, Math.ceil(maxResults / scopes.length)).map(
        (r): DynamicResult => ({
          scope,
          title: r.title,
          description: r.description ?? "",
          url: r.url,
          score: r.score,
        }),
      );
    } catch (error) {
      // Log error and track failed scope for caller awareness (per [RC1])
      logger.warn(`[RAG] Search failed for scope "${scope}":`, { error, scope });
      failedScopes.push(scope);
      return [];
    }
  });

  try {
    // Race all searches against timeout
    const results = await Promise.race([Promise.all(searchPromises), timeoutPromise]);

    // Flatten, validate scores, sort by score descending, and limit results
    const sortedResults = results
      .flat()
      .filter((r) => typeof r.score === "number" && Number.isFinite(r.score))
      .toSorted((a, b) => b.score - a.score)
      .slice(0, maxResults);

    // Determine status based on failures
    const status = failedScopes.length === 0 ? "success" : "partial";

    return {
      results: sortedResults,
      status,
      ...(failedScopes.length > 0 && { failedScopes }),
    };
  } catch (error) {
    // Timeout or other error - return with failed status (per [RC1]: no silent degradation)
    logger.error("[RAG] Dynamic retrieval failed:", { error, scopes, timeoutMs });
    return { results: [], status: "failed", failedScopes: scopes };
  }
}
