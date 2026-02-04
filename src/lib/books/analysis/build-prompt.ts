/**
 * Book Analysis Prompt Builder
 * @module lib/books/analysis/build-prompt
 * @description
 * Constructs system and user prompts for LLM book analysis.
 * Tailored for literary content: themes, reading recommendations, audience fit.
 */

import type { BookAnalysisContext } from "@/types/book-ai-analysis";

// ─────────────────────────────────────────────────────────────────────────────
// System Prompt
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the system prompt for book analysis.
 * Instructs the LLM to act as a book analyst and return JSON.
 */
export function buildBookAnalysisSystemPrompt(): string {
  return `You are a literary analyst who provides insightful book reviews and recommendations. Analyze books across all genres—fiction, non-fiction, technical, self-help, business, etc. Adapt your analysis style to match the book's genre and audience. Respond with valid JSON only—no markdown, no code blocks.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// User Prompt
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the user prompt with book context and expected response format.
 *
 * @param context - Extracted book context
 * @returns Formatted user prompt string
 */
export function buildBookAnalysisUserPrompt(context: BookAnalysisContext): string {
  const sections: string[] = [];

  // Header
  sections.push("Analyze this book and return a JSON object with the structure shown below.");
  sections.push("");

  // Book metadata section
  sections.push("BOOK DATA:");
  sections.push(`- Title: ${context.title}`);

  if (context.subtitle) {
    sections.push(`- Subtitle: ${context.subtitle}`);
  }

  if (context.authors.length > 0) {
    sections.push(`- Author(s): ${context.authors.join(", ")}`);
  }

  if (context.genres.length > 0) {
    sections.push(`- Genres: ${context.genres.join(", ")}`);
  }

  if (context.publisher) {
    sections.push(`- Publisher: ${context.publisher}`);
  }

  if (context.publishedYear) {
    sections.push(`- Published: ${context.publishedYear}`);
  }

  if (context.narrators.length > 0) {
    sections.push(`- Narrated by: ${context.narrators.join(", ")}`);
  }

  if (context.description) {
    sections.push("");
    sections.push("DESCRIPTION:");
    sections.push(context.description);
  }

  if (context.existingSummary) {
    sections.push("");
    sections.push("EXISTING SUMMARY:");
    sections.push(context.existingSummary);
  }

  if (context.thoughts) {
    sections.push("");
    sections.push("READER'S THOUGHTS:");
    sections.push(context.thoughts);
  }

  // Response format section
  sections.push("");
  sections.push("EXPECTED JSON RESPONSE:");
  sections.push(`{
  "summary": "2-3 sentence overview of the book's content and significance",
  "category": "primary genre/category (e.g., 'Business Strategy', 'Science Fiction', 'Technical Reference')",
  "keyThemes": ["3-5 key themes, ideas, or takeaways from the book"],
  "idealReader": "description of who would benefit most from reading this book",
  "contextualDetails": {
    "writingStyle": "writing style (e.g., 'academic', 'conversational', 'narrative') or null",
    "readingLevel": "difficulty/depth level (e.g., 'introductory', 'intermediate', 'expert') or null",
    "commitment": "reading commitment (e.g., 'quick read', 'deep dive', 'reference') or null"
  },
  "relatedReading": ["related books, authors, or topics worth exploring"],
  "whyItMatters": "why this book matters or what makes it stand out"
}`);

  return sections.join("\n");
}
