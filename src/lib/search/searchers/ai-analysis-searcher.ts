/**
 * AI Analysis Search
 *
 * Searches AI-generated analysis content (summaries, highlights, themes)
 * across all domains: bookmarks, books, projects.
 *
 * Strategy: Query-time search using existing searchers to find parent items,
 * then fetch/filter their AI analysis from S3.
 *
 * @module lib/search/searchers/ai-analysis-searcher
 */

import type { SearchResult } from "@/types/search";
import type { AnalysisDomain } from "@/types/ai-analysis";
import type { BookmarkAiAnalysisResponse } from "@/types/schemas/bookmark-ai-analysis";
import type { BookAiAnalysisResponse } from "@/types/schemas/book-ai-analysis";
import type { ProjectAiAnalysisResponse } from "@/types/schemas/project-ai-analysis";
import { getCachedAnalysis } from "@/lib/ai-analysis/reader.server";
import { ServerCacheInstance } from "@/lib/server-cache";
import { sanitizeSearchQuery } from "@/lib/validators/search";
import { envLogger } from "@/lib/utils/env-logger";
import { searchBooks, searchBookmarks } from "./dynamic-searchers";
import { searchProjects } from "./static-searchers";

/** Union type for all domain-specific analysis responses */
type AnyAnalysisResponse =
  | BookmarkAiAnalysisResponse
  | BookAiAnalysisResponse
  | ProjectAiAnalysisResponse;

/** Configuration for each domain */
interface DomainConfig {
  searcher: (query: string) => Promise<SearchResult[]>;
  prefix: string;
  getParentUrl: (id: string) => string;
  extractSearchableText: (analysis: AnyAnalysisResponse) => string[];
  extractSnippet: (analysis: AnyAnalysisResponse, query: string) => string;
}

/** Extract searchable text from bookmark analysis. */
function extractBookmarkText(analysis: AnyAnalysisResponse): string[] {
  const a = analysis as BookmarkAiAnalysisResponse;
  return [
    a.summary,
    a.category,
    ...a.highlights,
    a.targetAudience,
    ...a.relatedResources,
    a.contextualDetails.primaryDomain,
    a.contextualDetails.format,
  ].filter((s): s is string => typeof s === "string" && s.length > 0);
}

/** Extract searchable text from book analysis. */
function extractBookText(analysis: AnyAnalysisResponse): string[] {
  const a = analysis as BookAiAnalysisResponse;
  return [
    a.summary,
    a.category,
    ...a.keyThemes,
    a.idealReader,
    ...a.relatedReading,
    a.whyItMatters,
    a.contextualDetails.writingStyle,
    a.contextualDetails.readingLevel,
  ].filter((s): s is string => typeof s === "string" && s.length > 0);
}

/** Extract searchable text from project analysis. */
function extractProjectText(analysis: AnyAnalysisResponse): string[] {
  const a = analysis as ProjectAiAnalysisResponse;
  return [
    a.summary,
    a.category,
    ...a.keyFeatures,
    a.targetUsers,
    ...a.relatedProjects,
    a.uniqueValue,
    a.technicalDetails.architecture,
    a.technicalDetails.complexity,
  ].filter((s): s is string => typeof s === "string" && s.length > 0);
}

/** Extract best-matching snippet from analysis for display. */
function extractSnippetFromTexts(texts: string[], query: string, fieldLabels: string[]): string {
  const queryLower = query.toLowerCase();
  const terms = queryLower.split(/\s+/).filter(Boolean);

  // Score each text by query match quality
  const scored = texts.map((text, index) => {
    const textLower = text.toLowerCase();
    let score = 0;

    // Exact phrase match is best
    if (textLower.includes(queryLower)) {
      score = 3;
    } else if (terms.every((term) => textLower.includes(term))) {
      score = 2;
    } else if (terms.some((term) => textLower.includes(term))) {
      score = 1;
    }

    return { text, score, label: fieldLabels[index] ?? "" };
  });

  // Get best match
  const best = scored.toSorted((a, b) => b.score - a.score)[0];
  if (!best || best.score === 0) {
    // Fall back to summary (first text)
    return texts[0] ? `Summary: ${truncate(texts[0], 100)}` : "";
  }

  return best.label ? `${best.label}: ${truncate(best.text, 100)}` : truncate(best.text, 100);
}

const truncate = (text: string, maxLength: number): string =>
  text.length <= maxLength ? text : text.slice(0, maxLength - 3) + "...";

/** Domain configs mapping domain name to search behavior. */
const DOMAIN_CONFIGS: Record<AnalysisDomain, DomainConfig> = {
  bookmarks: {
    searcher: searchBookmarks,
    prefix: "Bookmarks",
    getParentUrl: (id) => `/bookmarks/${id}`,
    extractSearchableText: extractBookmarkText,
    extractSnippet: (analysis, query) => {
      const a = analysis as BookmarkAiAnalysisResponse;
      return extractSnippetFromTexts(
        [a.summary, ...a.highlights, a.targetAudience, a.category],
        query,
        ["Summary", ...a.highlights.map(() => "Highlight"), "Audience", "Category"],
      );
    },
  },
  books: {
    searcher: searchBooks,
    prefix: "Books",
    getParentUrl: (id) => `/books/${id}`,
    extractSearchableText: extractBookText,
    extractSnippet: (analysis, query) => {
      const a = analysis as BookAiAnalysisResponse;
      return extractSnippetFromTexts(
        [a.summary, ...a.keyThemes, a.idealReader, a.whyItMatters],
        query,
        ["Summary", ...a.keyThemes.map(() => "Theme"), "Ideal Reader", "Why It Matters"],
      );
    },
  },
  projects: {
    searcher: searchProjects,
    prefix: "Projects",
    getParentUrl: (id) => `/projects#${id}`,
    extractSearchableText: extractProjectText,
    extractSnippet: (analysis, query) => {
      const a = analysis as ProjectAiAnalysisResponse;
      return extractSnippetFromTexts(
        [a.summary, ...a.keyFeatures, a.targetUsers, a.uniqueValue],
        query,
        ["Summary", ...a.keyFeatures.map(() => "Feature"), "Target Users", "Unique Value"],
      );
    },
  },
};

const MAX_PARENT_RESULTS = 10; // Limit parent items to check per domain
const MAX_TOTAL_RESULTS = 15;

/**
 * Score how well analysis content matches the query.
 */
function scoreAnalysisMatch(texts: string[], query: string): { score: number; matchCount: number } {
  const queryLower = query.toLowerCase();
  const terms = queryLower.split(/\s+/).filter(Boolean);

  let matchCount = 0;
  let totalScore = 0;

  for (const text of texts) {
    const textLower = text.toLowerCase();

    // Exact phrase match
    if (textLower.includes(queryLower)) {
      matchCount++;
      totalScore += 1.0;
    } else if (terms.every((term) => textLower.includes(term))) {
      matchCount++;
      totalScore += 0.7;
    } else if (terms.some((term) => textLower.includes(term))) {
      matchCount++;
      totalScore += 0.3;
    }
  }

  return { score: totalScore, matchCount };
}

/**
 * Extract the ID from a search result URL.
 * Handles various URL patterns across domains.
 */
function extractIdFromUrl(url: string): string | null {
  // /bookmarks/[slug] -> slug is the id
  const bookmarkMatch = url.match(/\/bookmarks\/([^/?#]+)/);
  if (bookmarkMatch?.[1]) return bookmarkMatch[1];

  // /books/[slug] -> extract id from slug (format: title-id-author)
  const bookMatch = url.match(/\/books\/([^/?#]+)/);
  if (bookMatch?.[1]) {
    // Book slugs contain the ID - extract it
    // Slug format: "title-words-ID-author" where ID is alphanumeric
    const slug = bookMatch[1];
    const parts = slug.split("-");
    // ID is typically the second-to-last part before author
    if (parts.length >= 2) {
      // Find the part that looks like an ID (alphanumeric, specific length)
      for (let i = parts.length - 2; i > 0; i--) {
        const part = parts[i];
        if (part && /^[a-z0-9]{8,}$/i.test(part)) {
          return part;
        }
      }
    }
    return slug; // Fallback to full slug
  }

  // /projects#[id] -> id
  const projectMatch = url.match(/\/projects#([^/?]+)/);
  if (projectMatch?.[1]) return projectMatch[1];

  // /projects -> use title as id (projects don't have separate IDs)
  if (url === "/projects") return null;

  return null;
}

/**
 * Search AI analysis for a single domain.
 */
async function searchDomainAnalysis(
  domain: AnalysisDomain,
  query: string,
): Promise<SearchResult[]> {
  const config = DOMAIN_CONFIGS[domain];
  const results: SearchResult[] = [];

  try {
    // Step 1: Search parent items to get candidates
    const parentResults = await config.searcher(query);
    const topParents = parentResults.slice(0, MAX_PARENT_RESULTS);

    // Step 2: Fetch AI analysis for each parent (in parallel)
    const analysisPromises = topParents.map(async (parent) => {
      const id = extractIdFromUrl(parent.url);
      if (!id) return null;

      const cached = await getCachedAnalysis<AnyAnalysisResponse>(domain, id);
      if (!cached) return null;

      return { parent, analysis: cached.analysis, id };
    });

    const analysisResults = await Promise.all(analysisPromises);

    // Step 3: Score and filter by analysis content match
    for (const result of analysisResults) {
      if (!result) continue;

      const { parent, analysis, id } = result;
      const searchableTexts = config.extractSearchableText(analysis);
      const { score, matchCount } = scoreAnalysisMatch(searchableTexts, query);

      // Only include if analysis content actually matches the query
      if (matchCount > 0) {
        const snippet = config.extractSnippet(analysis, query);

        results.push({
          id: `analysis:${domain}:${id}`,
          type: "page",
          // Hierarchical format: [Domain] > [Parent Title] > "Snippet..."
          title: `[${config.prefix}] > ${parent.title.replace(/^\[.*?\]\s*/, "")} > "${snippet}"`,
          description: truncate("summary" in analysis ? analysis.summary : "", 150),
          url: parent.url,
          // Combine parent relevance with analysis match quality
          score: parent.score * 0.4 + score * 0.6,
        });
      }
    }
  } catch (error) {
    envLogger.log(
      `AI analysis search failed for ${domain}`,
      { error: String(error) },
      { category: "Search" },
    );
  }

  return results;
}

/** Search AI-generated analysis content across all domains. */
export async function searchAiAnalysis(query: string): Promise<SearchResult[]> {
  const sanitizedQuery = sanitizeSearchQuery(query);
  if (!sanitizedQuery) return [];

  // Check cache first
  const cached = ServerCacheInstance.getSearchResults<SearchResult>("ai-analysis", sanitizedQuery);
  if (cached && !ServerCacheInstance.shouldRefreshSearch("ai-analysis", sanitizedQuery)) {
    return cached.results;
  }

  // Search all domains in parallel
  const domains: AnalysisDomain[] = ["bookmarks", "books", "projects"];
  const domainResults = await Promise.all(
    domains.map((domain) => searchDomainAnalysis(domain, sanitizedQuery)),
  );

  // Combine, sort by score, and limit
  const allResults = domainResults
    .flat()
    .toSorted((a, b) => b.score - a.score)
    .slice(0, MAX_TOTAL_RESULTS);

  // Cache results
  ServerCacheInstance.setSearchResults("ai-analysis", sanitizedQuery, allResults);

  return allResults;
}
