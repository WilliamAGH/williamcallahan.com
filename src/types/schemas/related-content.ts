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

export type RelatedContentType = z.infer<typeof relatedContentTypeSchema>;

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

export type SimilarityWeights = z.infer<typeof similarityWeightsSchema>;

export const contentGraphMetadataSchema = z.object({
  version: z.string(),
  generated: z.string(),
  counts: z.object({
    total: z.number(),
    bookmarks: z.number(),
    blog: z.number(),
    investments: z.number(),
    projects: z.number(),
  }),
  uniqueTags: z.number(),
  environment: z.string(),
});

export type ContentGraphMetadata = z.infer<typeof contentGraphMetadataSchema>;

/**
 * Build metadata written by content-graph/build.ts.
 * Shape differs from contentGraphMetadataSchema (which is for the full UI metadata).
 */
export const contentGraphBuildMetadataSchema = z.object({
  version: z.string(),
  generated: z.string(),
  counts: z.object({
    total: z.number(),
    blogPosts: z.number(),
    projects: z.number(),
    bookmarks: z.number(),
  }),
});

export type ContentGraphBuildMetadata = z.infer<typeof contentGraphBuildMetadataSchema>;

/**
 * Tag entry within the tag co-occurrence graph.
 */
const tagGraphEntrySchema = z.object({
  count: z.number(),
  coOccurrences: z.record(z.string(), z.number()),
  contentIds: z.array(z.string()),
  relatedTags: z.array(z.string()),
});

/**
 * Tag co-occurrence graph schema.
 * Matches the TagGraph interface in types/related-content.ts.
 */
export const tagGraphSchema = z.object({
  tags: z.record(z.string(), tagGraphEntrySchema),
  tagHierarchy: z.record(z.string(), z.array(z.string())),
  metadata: z
    .object({
      totalTags: z.number(),
      totalContent: z.number(),
      generated: z.string(),
    })
    .optional(),
});

export type TagGraph = z.infer<typeof tagGraphSchema>;

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
