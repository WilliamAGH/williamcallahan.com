/**
 * Thoughts Data Service (Server)
 * @module lib/thoughts/service.server
 * @description
 * Server-side data access for thoughts (TIL-style short-form content).
 * Backed by PostgreSQL via Drizzle ORM.
 */

import type { Thought, ThoughtBrief, ThoughtCategory } from "@/types/schemas/thought";
import {
  readAllThoughts,
  readThoughtBySlug,
  readThoughtById,
  readThoughtCategories,
  readThoughtListItems,
} from "@/lib/db/queries/thoughts";

/**
 * Get all published (non-draft) thoughts, ordered by creation date descending.
 */
export function getThoughts(): Promise<Thought[]> {
  return readAllThoughts();
}

/**
 * Get all published thoughts as list items (excerpt instead of full content).
 */
export function getThoughtListItems(): Promise<ThoughtBrief[]> {
  return readThoughtListItems();
}

/**
 * Get a single thought by its URL slug, or null if not found.
 */
export function getThoughtBySlug(slug: string): Promise<Thought | null> {
  return readThoughtBySlug(slug);
}

/**
 * Get a single thought by its UUID, or null if not found.
 */
export function getThoughtById(id: string): Promise<Thought | null> {
  return readThoughtById(id);
}

/**
 * Get all unique categories with their thought counts.
 */
export function getThoughtCategories(): Promise<ThoughtCategory[]> {
  return readThoughtCategories();
}
