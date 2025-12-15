/**
 * Bookmark AI Analysis Schemas
 * @module types/schemas/bookmark-ai-analysis
 * @description
 * Zod v4 schemas for the AI-generated bookmark analysis response.
 */

import { z } from "zod/v4";

// ─────────────────────────────────────────────────────────────────────────────
// Category Schema
// ─────────────────────────────────────────────────────────────────────────────

/** Valid categories for bookmark classification */
export const bookmarkAiAnalysisCategorySchema = z.enum([
  "Framework",
  "Library",
  "Development Tool",
  "Service",
  "Platform",
  "Article",
  "Documentation",
  "Tutorial",
  "Reference",
  "Community",
  "News",
  "Research",
  "Product",
  "Other",
]);

export type BookmarkAiAnalysisCategory = z.infer<typeof bookmarkAiAnalysisCategorySchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Technical Details Schema
// ─────────────────────────────────────────────────────────────────────────────

/** Technical details extracted from the bookmark */
export const bookmarkAiAnalysisTechnicalDetailsSchema = z.object({
  /** Primary programming language if applicable */
  language: z.string().nullable(),
  /** Supported platforms */
  platform: z.string().nullable(),
  /** Installation or access method if mentioned */
  installMethod: z.string().nullable(),
});

export type BookmarkAiAnalysisTechnicalDetails = z.infer<typeof bookmarkAiAnalysisTechnicalDetailsSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Full Response Schema
// ─────────────────────────────────────────────────────────────────────────────

/** Complete AI analysis response for a bookmark */
export const bookmarkAiAnalysisResponseSchema = z.object({
  /** 2-3 sentence overview of what this bookmark is about */
  summary: z.string().min(1),
  /** Primary category classification */
  category: bookmarkAiAnalysisCategorySchema,
  /** List of 3-5 main features or capabilities */
  keyFeatures: z.array(z.string()).min(1).max(6),
  /** List of 2-4 practical use cases */
  useCases: z.array(z.string()).min(1).max(5),
  /** Technical details if applicable */
  technicalDetails: bookmarkAiAnalysisTechnicalDetailsSchema,
  /** Any mentioned related tools or projects */
  relatedProjects: z.array(z.string()),
  /** Who would benefit from this */
  targetAudience: z.string().min(1),
  /** Why a developer might bookmark this */
  personalRelevance: z.string().min(1),
});

export type BookmarkAiAnalysisResponse = z.infer<typeof bookmarkAiAnalysisResponseSchema>;
