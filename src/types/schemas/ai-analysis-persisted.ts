/**
 * AI Analysis Persistence Schemas
 * @module types/schemas/ai-analysis-persisted
 * @description
 * Zod v4 schemas for persisting AI-generated analysis to S3 with metadata envelope.
 * Domain-agnostic: works for bookmarks, projects, books, etc.
 */

import { z } from "zod/v4";

// ─────────────────────────────────────────────────────────────────────────────
// Metadata Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Metadata envelope for persisted AI analysis.
 * Tracks generation context for cache invalidation and versioning.
 */
export const analysisMetadataSchema = z.object({
  /** ISO timestamp when the analysis was generated */
  generatedAt: z.string().datetime(),
  /** Model version identifier (e.g., "v1", "gpt-4-turbo") */
  modelVersion: z.string().min(1),
  /** Optional content hash for change detection */
  contentHash: z.string().optional(),
});

export type AnalysisMetadata = z.infer<typeof analysisMetadataSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Generic Persisted Analysis Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a persisted analysis schema by wrapping a domain-specific analysis schema
 * with the standard metadata envelope.
 *
 * @param analysisSchema - The domain-specific analysis schema (e.g., bookmarkAiAnalysisResponseSchema)
 * @returns A Zod schema for the complete persisted analysis with metadata
 *
 * @example
 * ```ts
 * const persistedBookmarkAnalysisSchema = createPersistedAnalysisSchema(
 *   bookmarkAiAnalysisResponseSchema
 * );
 * ```
 */
export function createPersistedAnalysisSchema<T extends z.ZodType>(analysisSchema: T) {
  return z.object({
    metadata: analysisMetadataSchema,
    analysis: analysisSchema,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-built Persisted Analysis Schemas
// ─────────────────────────────────────────────────────────────────────────────

import { bookmarkAiAnalysisResponseSchema } from "./bookmark-ai-analysis";

/** Persisted bookmark analysis schema with metadata envelope */
export const persistedBookmarkAnalysisSchema = createPersistedAnalysisSchema(
  bookmarkAiAnalysisResponseSchema,
);

export type PersistedBookmarkAnalysis = z.infer<typeof persistedBookmarkAnalysisSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Request Schema for API Endpoint
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Request body schema for persisting analysis via API.
 * Client sends the analysis; server adds metadata.
 */
export const persistAnalysisRequestSchema = z.object({
  /** The analysis data to persist */
  analysis: z.record(z.string(), z.unknown()),
  /** Optional model version override (defaults to "v1") */
  modelVersion: z.string().min(1).optional(),
});

export type PersistAnalysisRequest = z.infer<typeof persistAnalysisRequestSchema>;
