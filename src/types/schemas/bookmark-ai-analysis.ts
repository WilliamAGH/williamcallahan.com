/**
 * Bookmark AI Analysis Schemas
 * @module types/schemas/bookmark-ai-analysis
 * @description
 * Zod v4 schemas for AI-generated bookmark analysis.
 * Domain-agnostic: works for any topic (tech, recipes, art, finance, etc.)
 */

import { z } from "zod/v4";

// ─────────────────────────────────────────────────────────────────────────────
// Contextual Details Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Contextual details - meanings adapt to content domain.
 * Examples: primaryDomain could be "Python" for code, "Thai cuisine" for recipes.
 */
export const bookmarkAiAnalysisContextualDetailsSchema = z.object({
  /** Primary subject area (e.g., "React", "French cooking", "Jazz history") */
  primaryDomain: z.string().nullable(),
  /** Content format/medium (e.g., "interactive tool", "video series", "blog post") */
  format: z.string().nullable(),
  /** How to access (e.g., "free online", "subscription required", "open source") */
  accessMethod: z.string().nullable(),
});

export type BookmarkAiAnalysisContextualDetails = z.infer<
  typeof bookmarkAiAnalysisContextualDetailsSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// Full Response Schema
// ─────────────────────────────────────────────────────────────────────────────

/** Complete AI analysis response for a bookmark */
export const bookmarkAiAnalysisResponseSchema = z.object({
  /** 2-3 sentence overview of what this bookmark is about */
  summary: z.string().min(1),
  /** LLM-determined category appropriate to the content (free-form) */
  category: z.string().min(1),
  /** 3-5 key points, notable aspects, or main takeaways */
  highlights: z.array(z.string()).min(1).max(6),
  /** Contextual details adapted to the content domain */
  contextualDetails: bookmarkAiAnalysisContextualDetailsSchema,
  /** Related topics, resources, or references mentioned */
  relatedResources: z.array(z.string()),
  /** Who would find this valuable or interesting */
  targetAudience: z.string().min(1),
});

export type BookmarkAiAnalysisResponse = z.infer<typeof bookmarkAiAnalysisResponseSchema>;
