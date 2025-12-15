/**
 * Bookmark Analysis Prompt Builder
 * @module lib/bookmarks/analysis/build-prompt
 * @description
 * Constructs system and user prompts for LLM bookmark analysis.
 */

import type { BookmarkAnalysisContext } from "@/types/bookmark-ai-analysis";

// ─────────────────────────────────────────────────────────────────────────────
// System Prompt
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the system prompt for bookmark analysis.
 * Instructs the LLM to act as a bookmark analyst and return JSON.
 */
export function buildBookmarkAnalysisSystemPrompt(): string {
  return `You are a bookmark analyst. Given bookmark metadata and content, provide a comprehensive analysis. Be factual, concise, and extract meaningful insights. Always respond with valid JSON only, no markdown formatting or code blocks.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// User Prompt
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the user prompt with bookmark context and expected response format.
 *
 * @param context - Extracted bookmark context
 * @returns Formatted user prompt string
 */
export function buildBookmarkAnalysisUserPrompt(context: BookmarkAnalysisContext): string {
  const sections: string[] = [];

  // Header
  sections.push("Analyze this bookmark and return a JSON object with the structure shown below.");
  sections.push("");

  // Bookmark metadata section
  sections.push("BOOKMARK DATA:");
  sections.push(`- Title: ${context.title}`);
  sections.push(`- URL: ${context.url}`);

  if (context.description) {
    sections.push(`- Description: ${context.description}`);
  }

  if (context.tags.length > 0) {
    sections.push(`- Tags: ${context.tags.join(", ")}`);
  }

  if (context.author) {
    sections.push(`- Author: ${context.author}`);
  }

  if (context.publisher) {
    sections.push(`- Publisher: ${context.publisher}`);
  }

  if (context.existingSummary) {
    sections.push(`- Existing Summary: ${context.existingSummary}`);
  }

  if (context.note) {
    sections.push(`- User Note: ${context.note}`);
  }

  // Content excerpt section
  if (context.contentExcerpt) {
    sections.push("");
    sections.push("CONTENT EXCERPT:");
    sections.push(context.contentExcerpt);
  }

  // Response format section
  sections.push("");
  sections.push("RESPONSE FORMAT:");
  sections.push(`{
  "summary": "2-3 sentence overview of what this bookmark is about",
  "category": "Framework|Library|Development Tool|Service|Platform|Article|Documentation|Tutorial|Reference|Community|News|Research|Product|Other",
  "keyFeatures": ["list of 3-5 main features or capabilities"],
  "useCases": ["list of 2-4 practical use cases"],
  "technicalDetails": {
    "language": "primary programming language if applicable, or null",
    "platform": "supported platforms, or null",
    "installMethod": "how to install/access if mentioned, or null"
  },
  "relatedProjects": ["any mentioned related tools or projects"],
  "targetAudience": "who would benefit from this",
  "personalRelevance": "why a developer might bookmark this"
}`);

  return sections.join("\n");
}
