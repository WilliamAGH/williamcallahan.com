/**
 * Shared Zod schemas for AI analysis responses
 * @module types/schemas/ai-analysis-common
 * @description
 * Common field schemas used across all AI analysis domain schemas
 * (bookmark, book, project). Single source of truth for string
 * validation, nullable variants, and list constraints.
 */

import { z } from "zod/v4";

/** Non-empty string containing at least one letter or number (trimmed) */
export const meaningfulStringSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => /[\p{L}\p{N}]/u.test(value), "String must include letters or numbers");

/** Nullable variant — allows null for optional detail fields */
export const nullableMeaningfulStringSchema = meaningfulStringSchema.nullable();

/** Array of 1-6 meaningful strings — used for highlights, themes, features, etc. */
export const meaningfulStringListSchema = z.array(meaningfulStringSchema).min(1).max(6);
