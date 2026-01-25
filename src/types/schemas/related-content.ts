/**
 * Related Content Schemas
 * @module types/schemas/related-content
 */

import { z } from "zod/v4";

/**
 * Content types that can be related/recommended.
 * Matches RelatedContentType from types/related-content.ts
 */
export const relatedContentTypeSchema = z.enum(["bookmark", "blog", "investment", "project", "thought", "book"]);

export type RelatedContentTypeFromSchema = z.infer<typeof relatedContentTypeSchema>;

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
