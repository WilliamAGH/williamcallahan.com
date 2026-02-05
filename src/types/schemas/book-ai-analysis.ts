/**
 * Book AI Analysis Schemas
 * @module types/schemas/book-ai-analysis
 * @description
 * Zod v4 schemas for AI-generated book analysis.
 * Tailored for literary content: themes, reading recommendations, audience fit.
 */

import { z } from "zod/v4";

// ─────────────────────────────────────────────────────────────────────────────
// Contextual Details Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Contextual details about the book's style and accessibility.
 */
export const bookAiAnalysisContextualDetailsSchema = z.object({
  /** Writing style (e.g., "academic", "conversational", "narrative") */
  writingStyle: z.string().nullable(),
  /** Difficulty/depth level (e.g., "introductory", "intermediate", "expert") */
  readingLevel: z.string().nullable(),
  /** Estimated reading commitment (e.g., "quick read", "deep dive", "reference") */
  commitment: z.string().nullable(),
});

export type BookAiAnalysisContextualDetails = z.infer<typeof bookAiAnalysisContextualDetailsSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Full Response Schema
// ─────────────────────────────────────────────────────────────────────────────

/** Complete AI analysis response for a book */
export const bookAiAnalysisResponseSchema = z.object({
  /** 2-3 sentence overview of the book's content and significance */
  summary: z.string().min(1),
  /** Primary genre/category (e.g., "Business Strategy", "Science Fiction") */
  category: z.string().min(1),
  /** 3-5 key themes, ideas, or takeaways from the book */
  keyThemes: z.array(z.string()).min(1).max(6),
  /** What type of reader would benefit most */
  idealReader: z.string().min(1),
  /** Contextual details about the book's style and accessibility */
  contextualDetails: bookAiAnalysisContextualDetailsSchema,
  /** Related books, authors, or topics worth exploring */
  relatedReading: z.array(z.string()),
  /** Why this book matters or stands out */
  whyItMatters: z.string().min(1),
});

export type BookAiAnalysisResponse = z.infer<typeof bookAiAnalysisResponseSchema>;
