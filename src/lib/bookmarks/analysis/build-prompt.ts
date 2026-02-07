/**
 * Bookmark Analysis Prompt Builder
 * @module lib/bookmarks/analysis/build-prompt
 * @description
 * Constructs system and user prompts for LLM bookmark analysis.
 * Domain-agnostic: works for any topic (tech, recipes, art, finance, etc.)
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
  return `You analyze bookmarked content and extract structured insights. Bookmarks can be about any topic: software, cooking, art, finance, travel, music, science, etc. Adapt your analysis to fit the content's domain.`;
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
  sections.push("EXPECTED JSON RESPONSE:");
  sections.push(`{
  "summary": "2-3 sentence overview of what this content is about",
  "category": "a concise category label appropriate to the content (e.g., 'Python Library', 'Recipe', 'Research Paper', 'Design Tool', 'Travel Guide', 'Album Review')",
  "highlights": ["3-5 key points, notable aspects, or main takeaways"],
  "contextualDetails": {
    "primaryDomain": "main subject area (e.g., 'Machine Learning', 'Italian Cuisine', 'Jazz Music') or null if not applicable",
    "format": "content format (e.g., 'interactive tool', 'long-form article', 'video tutorial', 'podcast') or null",
    "accessMethod": "how to access (e.g., 'free online', 'open source', 'subscription required') or null"
  },
  "relatedResources": ["any related topics, tools, or references mentioned"],
  "targetAudience": "who would find this valuable or interesting"
}`);

  return sections.join("\n");
}
