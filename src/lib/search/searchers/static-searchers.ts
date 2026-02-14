/**
 * Static Content Search Functions
 *
 * Search functions for static content types: investments, experience, education, projects.
 * Uses the createCachedSearchFunction factory for consistent implementation.
 *
 * @module lib/search/searchers/static-searchers
 */

import type { SearchResult } from "@/types/search";
import { createCachedSearchFunction } from "../search-factory";
import {
  getInvestmentsIndex,
  getExperienceIndex,
  getEducationIndex,
  getProjectsIndex,
  getEducationItems,
  investments,
  experiences,
  projectsData,
} from "../loaders/static-content";
import { generateProjectSlug } from "@/lib/projects/slug-helpers";
import { sanitizeSearchQuery } from "@/lib/validators/search";

/**
 * Search investments by query.
 */
export const searchInvestments = createCachedSearchFunction({
  cacheKey: "investments",
  getIndex: getInvestmentsIndex,
  getItems: () => investments,
  getSearchableFields: (inv) => [
    inv.name,
    inv.description,
    inv.type,
    inv.status,
    inv.founded_year,
    inv.invested_year,
    inv.acquired_year,
    inv.shutdown_year,
  ],
  getExactMatchField: (inv) => inv.name,
  transformResult: (inv, score) => ({
    id: inv.id,
    type: "project" as const,
    title: inv.name,
    description: inv.description,
    url: `/investments#${inv.id}`,
    score,
  }),
});

/**
 * Search experience by query.
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
});

/**
 * Search education by query.
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
});

/**
 * Search projects by query.
 * Includes special handling for exact "projects" query to add navigation result.
 */
export async function searchProjects(query: string): Promise<SearchResult[]> {
  const baseSearch = createCachedSearchFunction({
    cacheKey: "projects",
    getIndex: getProjectsIndex,
    getItems: () => projectsData,
    getSearchableFields: (p) => [p.name, p.description, (p.tags || []).join(" ")],
    getExactMatchField: (p) => p.name,
    getItemId: (p) => p.name,
    transformResult: (p, score) => ({
      id: p.name,
      type: "project" as const,
      title: p.name,
      description: p.shortSummary || p.description,
      url: `/projects/${generateProjectSlug(p.name, p.id)}`,
      score,
    }),
  });

  // Widen to SearchResult[] to allow adding navigation results with different types
  const searchResults: SearchResult[] = await baseSearch(query);

  // If the query is exactly "projects", add navigation result at top
  const sanitized = sanitizeSearchQuery(query).toLowerCase();
  if (sanitized === "projects" || sanitized === "project") {
    searchResults.unshift({
      id: "projects-page",
      type: "page",
      title: "Projects",
      description: "Explore all projects",
      url: "/projects",
      score: 1,
    });
  }

  return searchResults;
}
