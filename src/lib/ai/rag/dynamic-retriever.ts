/**
 * Dynamic Content Retriever for RAG
 *
 * Performs query-time search using existing search functions.
 * Detects relevant scopes from query keywords and retrieves matching content.
 *
 * @module lib/ai/rag/dynamic-retriever
 */

import type {
  DynamicResult,
  RagScopeName,
  ScopeSearcher,
  RetrieveOptions,
  RetrieveResult,
} from "@/types/rag";
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
import { searchThoughts } from "@/lib/search/searchers/thoughts-search";
import logger from "@/lib/utils/logger";

/**
 * Scope detection patterns.
 * Each scope has keywords that trigger searching that content type.
 */
const SCOPE_PATTERNS: Record<RagScopeName, RegExp> = {
  projects: /\b(projects?|built|apps?|tools?|software|code|github|develop|create)\b/i,
  blog: /\b(blog|articles?|wrote|write|posts?)\b/i,
  investments: /\b(invest|portfolio|startups?|fund|venture|vc|backed|seed)\b/i,
  experience: /\b(work|jobs?|roles?|experience|employ|company|career|position)\b/i,
  education: /\b(education|degrees?|certs?|certif|school|university|learn|study|cfa|cfp|mba)\b/i,
  books: /\b(books?|reading|read|authors?|library|shelf)\b/i,
  bookmarks: /\b(bookmarks?|bookmarked|links?|resources?|saved?|favorites?)\b/i,
  tags: /\b(tags?|topics?|categories|subjects?|themes?|writes?\s+about)\b/i,
  analysis: /\b(analysis|summary|summaries|insight|overview|highlights?|ai\s*generated|themes?)\b/i,
  thoughts: /\b(thoughts?|notes?|ruminations?)\b/i,
};

const DEFAULT_FALLBACK_SCOPES: RagScopeName[] = [
  "projects",
  "blog",
  "investments",
  "experience",
  "education",
  "books",
  "bookmarks",
  "tags",
  "analysis",
];

/**
 * Detects which content scopes are relevant to a query.
 * Returns an array of typed scope names to search.
 */
function detectRelevantScopes(query: string): RagScopeName[] {
  const scopes: RagScopeName[] = [];

  for (const [scope, pattern] of Object.entries(SCOPE_PATTERNS) as [RagScopeName, RegExp][]) {
    if (pattern.test(query)) {
      scopes.push(scope);
    }
  }

  return scopes;
}

/**
 * Search function mapping for each scope.
 * Uses RagScopeName type to ensure keys match SCOPE_PATTERNS.
 */
const SCOPE_SEARCHERS: Record<RagScopeName, ScopeSearcher> = {
  projects: searchProjects,
  blog: searchBlogPostsServerSide,
  investments: searchInvestments,
  experience: searchExperience,
  education: searchEducation,
  books: searchBooks,
  bookmarks: searchBookmarks,
  tags: searchTags,
  analysis: searchAiAnalysis,
  thoughts: searchThoughts,
};

/** Race a promise against a per-scope timeout; clears the timer on settlement. */
function withScopeTimeout<T>(promise: Promise<T>, ms: number, scope: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Scope "${scope}" timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/**
 * Retrieves content relevant to a user query.
 * Detects scopes from query keywords and runs appropriate searches.
 * Each scope runs with its own timeout so a single slow scope (e.g. S3-backed
 * analysis) cannot prevent fast in-memory scopes from contributing results.
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

  const detectedScopes = detectRelevantScopes(query);
  const scopes = detectedScopes.length > 0 ? detectedScopes : DEFAULT_FALLBACK_SCOPES;

  if (detectedScopes.length === 0) {
    logger.info("[RAG] No scope keywords detected; using fallback scopes", { scopes, query });
  }

  // Track failed scopes for caller awareness
  const failedScopes: string[] = [];

  // Each scope gets its own timeout so slow scopes fail independently
  const searchPromises = scopes.map(async (scope): Promise<DynamicResult[]> => {
    const searcher = SCOPE_SEARCHERS[scope];
    if (!searcher) {
      logger.warn(`[RAG] No searcher registered for scope: ${scope}`);
      failedScopes.push(scope);
      return [];
    }

    try {
      const results = await withScopeTimeout(searcher(query), timeoutMs, scope);
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
      logger.warn(`[RAG] Search failed for scope "${scope}":`, { error, scope });
      failedScopes.push(scope);
      return [];
    }
  });

  // Each scope catches its own errors/timeouts, so Promise.all always resolves
  const results = await Promise.all(searchPromises);

  const sortedResults = results
    .flat()
    .filter((r) => typeof r.score === "number" && Number.isFinite(r.score))
    .toSorted((a, b) => b.score - a.score)
    .slice(0, maxResults);

  // All scopes failed = overall failure; some failed = partial; none = success
  if (failedScopes.length === scopes.length) {
    return { results: sortedResults, status: "failed", failedScopes };
  }

  const status = failedScopes.length === 0 ? "success" : "partial";
  return {
    results: sortedResults,
    status,
    ...(failedScopes.length > 0 && { failedScopes }),
  };
}
