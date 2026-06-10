/**
 * Project Slug Helpers
 * @module lib/projects/slug-helpers
 * @description
 * Utilities for generating URL-safe slugs from project data.
 * Format: project name slug.
 *
 * Project URLs use the same name-derived slug stored in PostgreSQL.
 */

import type { Project } from "@/types/project";

/**
 * Generate a URL-safe slug from project data.
 *
 * @example
 * generateProjectSlug("aVenture.vc") // "aventure-vc"
 */
export function generateProjectSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function matchesProjectSlug(project: Project, normalizedSlug: string): boolean {
  return (
    generateProjectSlug(project.name) === normalizedSlug ||
    generateProjectSlug(project.id) === normalizedSlug
  );
}

/**
 * Find a project by its slug from a list of projects.
 *
 * @param slug - The URL slug to search for
 * @param projects - Array of projects to search
 * @returns The matching project or null
 */
export function findProjectBySlug(slug: string, projects: Project[]): Project | null {
  if (!slug || !projects?.length) {
    return null;
  }

  const normalizedSlug = slug.trim().toLowerCase();

  return projects.find((project) => matchesProjectSlug(project, normalizedSlug)) ?? null;
}

/**
 * Generate all slugs for static params generation.
 *
 * @param projects - Array of projects
 * @returns Array of slug objects for generateStaticParams
 */
export function getAllProjectSlugs(projects: Project[]): Array<{ slug: string }> {
  return projects.map((project) => ({
    slug: generateProjectSlug(project.name),
  }));
}
