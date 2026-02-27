/**
 * Static & Domain Content Search Functions
 *
 * - Investments, projects: hybrid PostgreSQL (FTS + trigram + pgvector)
 * - Experience, education: MiniSearch (no PG tables for these small static datasets)
 *
 * @module lib/search/searchers/static-searchers
 */

import type { SearchResult } from "@/types/search";
import { createCachedSearchFunction } from "../search-factory";
import {
  getExperienceIndex,
  getEducationIndex,
  getEducationItems,
  experiences,
} from "../loaders/static-content";
import { sanitizeSearchQuery } from "@/lib/validators/search";
import { buildQueryEmbedding } from "@/lib/db/queries/query-embedding";
import {
  hybridSearchInvestments,
  hybridSearchProjects,
} from "@/lib/db/queries/hybrid-search-investments";

const SEARCH_LIMIT = 50;

/**
 * Search investments via hybrid PostgreSQL (FTS + trigram + pgvector).
 */
export async function searchInvestments(query: string): Promise<SearchResult[]> {
  const sanitizedQuery = sanitizeSearchQuery(query);
  if (!sanitizedQuery) return [];

  const embedding = await buildQueryEmbedding(sanitizedQuery, "[searchInvestments]");
  const rows = await hybridSearchInvestments({
    query: sanitizedQuery,
    embedding,
    limit: SEARCH_LIMIT,
  });

  return rows.map((r) => ({
    id: r.id,
    type: "project" as const,
    title: r.name,
    description: r.description,
    url: `/investments#${r.slug}`,
    score: r.score,
  }));
}

/**
 * Search experience by query (MiniSearch — no PG table).
 */
export const searchExperience = createCachedSearchFunction({
  cacheKey: "experience",
  getIndex: getExperienceIndex,
  getItems: () => experiences,
  getSearchableFields: (exp) => [exp.company, exp.role, exp.period],
  getExactMatchField: (exp) => exp.company,
  transformResult: (exp, score) => ({
    id: exp.id,
    type: "project" as const,
    title: exp.company,
    description: exp.role,
    url: `/experience#${exp.id}`,
    score,
  }),
  hybridRerank: {
    getRerankText: (exp) => [exp.company, exp.role, exp.period].join("\n"),
  },
});

/**
 * Search education by query (MiniSearch — no PG table).
 */
export const searchEducation = createCachedSearchFunction({
  cacheKey: "education",
  getIndex: getEducationIndex,
  getItems: getEducationItems,
  getSearchableFields: (item) => [item.label, item.description],
  getExactMatchField: (item) => item.label,
  transformResult: (item, score) => ({
    id: item.id,
    type: "page" as const,
    title: item.label,
    description: item.description,
    url: item.path,
    score,
  }),
  hybridRerank: {
    getRerankText: (item) => [item.label, item.description].join("\n"),
  },
});

/**
 * Search projects via hybrid PostgreSQL (FTS + trigram + pgvector).
 * Includes special handling for exact "projects" query to add navigation result.
 */
export async function searchProjects(query: string): Promise<SearchResult[]> {
  const sanitizedQuery = sanitizeSearchQuery(query);
  if (!sanitizedQuery) return [];

  const embedding = await buildQueryEmbedding(sanitizedQuery, "[searchProjects]");
  const rows = await hybridSearchProjects({
    query: sanitizedQuery,
    embedding,
    limit: SEARCH_LIMIT,
  });

  const results: SearchResult[] = rows.map((r) => ({
    id: r.id,
    type: "project" as const,
    title: r.name,
    description: r.shortSummary || r.description,
    url: `/projects/${r.slug}`,
    score: r.score,
  }));

  // If the query is exactly "projects", add navigation result at top
  const lower = sanitizedQuery.toLowerCase();
  if (lower === "projects" || lower === "project") {
    results.unshift({
      id: "projects-page",
      type: "page",
      title: "Projects",
      description: "Explore all projects",
      url: "/projects",
      score: 1,
    });
  }

  return results;
}
