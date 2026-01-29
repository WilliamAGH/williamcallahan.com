/**
 * Related Content Schemas
 * @module types/schemas/related-content
 */

import { z } from "zod/v4";

/**
 * Content types that can be related/recommended.
 * Matches RelatedContentType from types/related-content.ts
 */
export const relatedContentTypeSchema = z.enum([
  "bookmark",
  "blog",
  "investment",
  "project",
  "thought",
  "book",
]);

export type RelatedContentTypeFromSchema = z.infer<typeof relatedContentTypeSchema>;

/**
 * Configuration for similarity scoring weights.
 * All values should be between 0 and 1.
 */
export const similarityWeightsSchema = z.object({
  /** Weight for tag matches (0-1) */
  tagMatch: z.number().min(0).max(1).optional(),
  /** Weight for text similarity (0-1) */
  textSimilarity: z.number().min(0).max(1).optional(),
  /** Weight for domain matches (0-1) */
  domainMatch: z.number().min(0).max(1).optional(),
  /** Weight for recency (0-1) */
  recency: z.number().min(0).max(1).optional(),
});

export type SimilarityWeightsFromSchema = z.infer<typeof similarityWeightsSchema>;

export const createRelatedContentDebugParamsSchema = ({
  maxLimit,
  defaultLimit,
  isEnabledType,
}: {
  maxLimit: number;
  defaultLimit: number;
  isEnabledType: (value: string) => boolean;
}) =>
  z.object({
    type: z.string().refine(isEnabledType, { message: "Unsupported type" }),
    id: z.string().min(1),
    limit: z.coerce.number().int().min(1).max(maxLimit).optional().default(defaultLimit),
  });
