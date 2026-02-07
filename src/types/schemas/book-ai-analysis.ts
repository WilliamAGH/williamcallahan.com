/**
 * Book AI Analysis Schemas
 * @module types/schemas/book-ai-analysis
 * @description
 * Zod v4 schemas for AI-generated book analysis.
 * Tailored for literary content: themes, reading recommendations, audience fit.
 */

import { z } from "zod/v4";
import {
  meaningfulStringSchema,
  nullableMeaningfulStringSchema,
  meaningfulStringListSchema,
} from "@/types/schemas/ai-analysis-common";

// ─────────────────────────────────────────────────────────────────────────────
// Contextual Details Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Contextual details about the book's style and accessibility.
 */
export const bookAiAnalysisContextualDetailsSchema = z.object({
  /** Writing style (e.g., "academic", "conversational", "narrative") */
  writingStyle: nullableMeaningfulStringSchema,
  /** Difficulty/depth level (e.g., "introductory", "intermediate", "expert") */
  readingLevel: nullableMeaningfulStringSchema,
  /** Estimated reading commitment (e.g., "quick read", "deep dive", "reference") */
  commitment: nullableMeaningfulStringSchema,
});

export type BookAiAnalysisContextualDetails = z.infer<typeof bookAiAnalysisContextualDetailsSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Full Response Schema
// ─────────────────────────────────────────────────────────────────────────────

/** Complete AI analysis response for a book */
export const bookAiAnalysisResponseSchema = z.object({
  /** 2-3 sentence overview of the book's content and significance */
  summary: meaningfulStringSchema,
  /** Primary genre/category (e.g., "Business Strategy", "Science Fiction") */
  category: meaningfulStringSchema,
  /** 3-5 key themes, ideas, or takeaways from the book */
  keyThemes: meaningfulStringListSchema,
  /** What type of reader would benefit most */
  idealReader: meaningfulStringSchema,
  /** Contextual details about the book's style and accessibility */
  contextualDetails: bookAiAnalysisContextualDetailsSchema,
  /** Related books, authors, or topics worth exploring */
  relatedReading: meaningfulStringListSchema,
  /** Why this book matters or stands out */
  whyItMatters: meaningfulStringSchema,
});

export type BookAiAnalysisResponse = z.infer<typeof bookAiAnalysisResponseSchema>;
