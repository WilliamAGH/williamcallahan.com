/**
 * Project Analysis Prompt Builder
 * @module lib/projects/analysis/build-prompt
 * @description
 * Constructs system and user prompts for LLM project analysis.
 * Tailored for technical content: features, architecture, use cases.
 */

import type { ProjectAnalysisContext } from "@/types/project-ai-analysis";

// ─────────────────────────────────────────────────────────────────────────────
// System Prompt
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the system prompt for project analysis.
 * Instructs the LLM to act as a technical analyst and return JSON.
 */
export function buildProjectAnalysisSystemPrompt(): string {
  return `You are a technical analyst who evaluates software projects. Analyze projects across all domains—web apps, CLI tools, libraries, mobile apps, developer tools, etc. Identify key features, target users, and what makes the project valuable.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// User Prompt
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the user prompt with project context and expected response format.
 *
 * @param context - Extracted project context
 * @returns Formatted user prompt string
 */
export function buildProjectAnalysisUserPrompt(context: ProjectAnalysisContext): string {
  const sections: string[] = [];

  // Header
  sections.push("Analyze this project and return a JSON object with the structure shown below.");
  sections.push("");

  // Project metadata section
  sections.push("PROJECT DATA:");
  sections.push(`- Name: ${context.name}`);
  sections.push(`- Summary: ${context.shortSummary}`);
  sections.push(`- URL: ${context.url}`);

  if (context.githubUrl) {
    sections.push(`- GitHub: ${context.githubUrl}`);
  }

  if (context.techStack.length > 0) {
    sections.push(`- Tech Stack: ${context.techStack.join(", ")}`);
  }

  if (context.tags.length > 0) {
    sections.push(`- Tags: ${context.tags.join(", ")}`);
  }

  if (context.description) {
    sections.push("");
    sections.push("DESCRIPTION:");
    sections.push(context.description);
  }

  if (context.note) {
    sections.push("");
    sections.push("NOTE:");
    sections.push(context.note);
  }

  // Response format section
  sections.push("");
  sections.push("EXPECTED JSON RESPONSE:");
  sections.push(`{
  "summary": "2-3 sentence overview of what the project does and its purpose",
  "category": "primary category (e.g., 'Developer Tool', 'Web Application', 'Library')",
  "keyFeatures": ["3-5 key features, capabilities, or notable aspects"],
  "targetUsers": "description of who would benefit from using this project",
  "technicalDetails": {
    "architecture": "architecture pattern (e.g., 'serverless', 'monolith', 'microservices') or null",
    "complexity": "complexity level (e.g., 'simple utility', 'moderate', 'enterprise-grade') or null",
    "maturity": "maturity level (e.g., 'experimental', 'production-ready', 'mature') or null"
  },
  "relatedProjects": ["similar projects, alternatives, or complementary tools"],
  "uniqueValue": "what makes this project interesting or innovative"
}`);

  return sections.join("\n");
}
