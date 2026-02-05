/**
 * Project Slug Helpers
 * @module lib/projects/slug-helpers
 * @description
 * Utilities for generating URL-safe slugs from project data.
 * Format: name-slug or name-slug-id-slug (when name and ID differ)
 *
 * Projects have simpler slug requirements than books since they
 * are static data with predictable IDs.
 */

import { titleToSlug } from "@/lib/utils/domain-utils";
import type { Project } from "@/types/project";

/**
 * Generate a URL-safe slug from project data.
 *
 * Strategy:
 * - If name and ID are the same (or ID is absent), use just the name slug
 * - If they differ, combine name and ID for uniqueness
 *
 * @example
 * // Same name and ID: "aventure-vc"
 * generateProjectSlug("aVenture.vc", "aVenture.vc")
 *
 * // Different name and ID: "company-research-tui-tui-aventure-vc"
 * generateProjectSlug("Company Research TUI", "tui-aventure-vc")
 */
export function generateProjectSlug(name: string, id?: string): string {
  const nameSlug = titleToSlug(name, 50);

  // If no ID or ID equals name, just use name slug
  if (!id || id === name) {
    return nameSlug;
  }

  const idSlug = titleToSlug(id, 30);

  // If slugified versions are the same, no need to duplicate
  if (nameSlug === idSlug) {
    return nameSlug;
  }

  // Combine for uniqueness
  return `${nameSlug}-${idSlug}`;
}

/**
 * Find a project by its slug from a list of projects.
 * Priority: exact generated slug > ID slug > name slug
 *
 * @param slug - The URL slug to search for
 * @param projects - Array of projects to search
 * @returns The matching project or null
 */
export function findProjectBySlug(slug: string, projects: Project[]): Project | null {
  if (!slug || !projects?.length) {
    return null;
  }

  const normalizedSlug = slug.toLowerCase();

  // Pre-compute all slugs once for efficiency
  // Note: idSlug uses 30-char limit to match generateProjectSlug's ID truncation
  const projectSlugs = projects.map((project) => ({
    project,
    generated: generateProjectSlug(project.name, project.id),
    idSlug: titleToSlug(project.id ?? project.name, 30),
    nameSlug: titleToSlug(project.name, 50),
  }));

  // Priority 1: exact generated slug match
  const exactMatch = projectSlugs.find((p) => p.generated === normalizedSlug);
  if (exactMatch) return exactMatch.project;

  // Priority 2: ID slug match
  const idMatch = projectSlugs.find((p) => p.idSlug === normalizedSlug);
  if (idMatch) return idMatch.project;

  // Priority 3: name slug match
  const nameMatch = projectSlugs.find((p) => p.nameSlug === normalizedSlug);
  if (nameMatch) return nameMatch.project;

  return null;
}

/**
 * Generate all slugs for static params generation.
 *
 * @param projects - Array of projects
 * @returns Array of slug objects for generateStaticParams
 */
export function getAllProjectSlugs(projects: Project[]): Array<{ slug: string }> {
  return projects.map((project) => ({
    slug: generateProjectSlug(project.name, project.id),
  }));
}
