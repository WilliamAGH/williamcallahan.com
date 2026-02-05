/**
 * Project Analysis Context Extractor
 * @module lib/projects/analysis/extract-context
 * @description
 * Extracts relevant context from a project for LLM prompt construction.
 */

import type { Project } from "@/types/project";
import type { ProjectAnalysisContext } from "@/types/project-ai-analysis";

/**
 * Extract analysis-relevant context from a project.
 * Normalizes optional fields and prepares data for prompt construction.
 *
 * @param project - The project to extract context from
 * @returns Normalized context object for prompt building
 */
export function extractProjectAnalysisContext(project: Project): ProjectAnalysisContext {
  return {
    name: project.name,
    shortSummary: project.shortSummary,
    description: project.description,
    url: project.url,
    githubUrl: project.githubUrl ?? null,
    techStack: project.techStack ?? [],
    tags: project.tags ?? [],
    note: project.note ?? null,
  };
}
