/**
 * Types for Thoughts + Chroma Integration
 * @module types/thoughts-chroma
 *
 * Type definitions for Chroma sync and query operations on Thoughts.
 */

import type { Metadata } from "chromadb";

/**
 * Metadata stored with each thought in Chroma.
 * Chroma limitations: no arrays, no nested objects, consistent types required.
 * Extends Metadata to ensure compatibility with Chroma's type system.
 */
export interface ThoughtChromaMetadata extends Metadata {
  slug: string;
  title: string;
  category: string; // Empty string if unset
  tags: string; // Comma-separated: "python,testing,pytest"
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601, same as createdAt if never updated
  draft: boolean;
  contentType: "thought"; // For future cross-collection queries
}

/**
 * Represents a related thought with similarity score.
 */
export interface RelatedThought {
  /** UUID of the related thought */
  id: string;
  /** URL slug for navigation */
  slug: string;
  /** Display title */
  title: string;
  /** Similarity distance (lower = more similar) */
  distance: number;
}

/**
 * Options for related thoughts query.
 */
export interface GetRelatedThoughtsOptions {
  /** Maximum number of results (default: 5) */
  limit?: number;
  /** Maximum distance to consider related (default: no limit) */
  maxDistance?: number;
  /** Whether to include draft thoughts (default: false) */
  includeDrafts?: boolean;
}

/**
 * Options for semantic search.
 */
export interface SearchThoughtsOptions {
  /** Maximum number of results (default: 10) */
  limit?: number;
  /** Filter by category */
  category?: string;
  /** Whether to include draft thoughts (default: false) */
  includeDrafts?: boolean;
  /** Maximum distance to include in results */
  maxDistance?: number;
}
