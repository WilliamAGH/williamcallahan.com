/**
 * Related Content Schemas
 * @module types/schemas/related-content
 */

import { z } from "zod/v4";

/** Content types that can be related/recommended. */
export const relatedContentTypeSchema = z.enum([
  "bookmark",
  "blog",
  "investment",
  "project",
  "thought",
  "book",
]);

export type RelatedContentType = z.infer<typeof relatedContentTypeSchema>;

export const relatedContentMetadataSchema = z.object({
  tags: z.array(z.string()).optional(),
  domain: z.string().optional(),
  date: z.string().optional(),
  imageUrl: z.string().optional(),
  readingTime: z.number().optional(),
  stage: z.string().optional(),
  category: z.string().optional(),
  aventureUrl: z.string().optional(),
  author: z
    .object({
      name: z.string(),
      avatar: z.string().optional(),
    })
    .optional(),
  authors: z.array(z.string()).optional(),
  formats: z.array(z.string()).optional(),
});

export type RelatedContentMetadata = z.infer<typeof relatedContentMetadataSchema>;

export const relatedContentEntrySchema = z.object({
  type: relatedContentTypeSchema,
  id: z.string(),
  score: z.number(),
  title: z.string(),
  metadata: relatedContentMetadataSchema.optional(),
});

export type RelatedContentEntry = z.infer<typeof relatedContentEntrySchema>;

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
