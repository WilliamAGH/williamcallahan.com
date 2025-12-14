/**
 * Thought Schemas
 * @module types/schemas/thought
 * @description
 * Zod v4 schemas for short-form content (TIL-style) with optional categorization.
 * URL structure: /thoughts/{category}/{slug} or /thoughts/{slug}
 */

import { z } from "zod/v4";

/**
 * Core thought schema - the single source of truth
 */
export const thoughtSchema = z.object({
  id: z.uuid(),
  slug: z.string().min(1),
  title: z.string(),
  content: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  draft: z.boolean().optional(),
  relatedThoughts: z.array(z.uuid()).optional(),
});

export type Thought = z.infer<typeof thoughtSchema>;

/**
 * Input schema - only title and content required
 * id, slug, createdAt auto-generated if omitted
 */
export const thoughtInputSchema = thoughtSchema.omit({ id: true, slug: true, createdAt: true }).extend({
  id: z.uuid().optional(),
  slug: z.string().optional(),
  createdAt: z.iso.datetime().optional(),
});

export type ThoughtInput = z.infer<typeof thoughtInputSchema>;

/**
 * List item schema - no content, adds excerpt for previews
 */
export const thoughtListItemSchema = thoughtSchema.omit({ content: true, relatedThoughts: true }).extend({
  excerpt: z.string().optional(),
});

export type ThoughtListItem = z.infer<typeof thoughtListItemSchema>;

/**
 * Category summary for filtering UI
 */
export const thoughtCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  count: z.number(),
});

export type ThoughtCategory = z.infer<typeof thoughtCategorySchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Validation Helpers
// ─────────────────────────────────────────────────────────────────────────────

export const validateThought = (data: unknown): Thought => thoughtSchema.parse(data);

export const validateThoughtInput = (data: unknown): ThoughtInput => thoughtInputSchema.parse(data);

export const validateThoughtListItem = (data: unknown): ThoughtListItem => thoughtListItemSchema.parse(data);
