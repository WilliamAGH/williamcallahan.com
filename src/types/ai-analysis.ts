/**
 * AI Analysis Domain Types
 * @module types/ai-analysis
 * @description
 * Domain types for AI analysis persistence across different content types.
 */

import type { AnalysisMetadata } from "@/types/schemas/ai-analysis-persisted";

// ─────────────────────────────────────────────────────────────────────────────
// Domain Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Supported analysis domains.
 * Each domain has its own S3 path prefix and analysis schema.
 */
export type AnalysisDomain = "bookmarks" | "projects" | "books";

// ─────────────────────────────────────────────────────────────────────────────
// Cached Analysis Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cached analysis with metadata envelope.
 * Generic over the domain-specific analysis type.
 */
export interface CachedAnalysis<T> {
  /** Metadata about when/how the analysis was generated */
  metadata: AnalysisMetadata;
  /** The domain-specific analysis data */
  analysis: T;
}

// ─────────────────────────────────────────────────────────────────────────────
// Options Interfaces
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Options for fetching cached analysis.
 */
export interface FetchAnalysisOptions {
  /** Skip cache and always return null (useful for testing) */
  skipCache?: boolean;
}

/**
 * Options for persisting analysis.
 */
export interface PersistAnalysisOptions {
  /** Model version identifier (defaults to "v1") */
  modelVersion?: string;
  /** Optional content hash for change detection */
  contentHash?: string;
  /** Skip writing versioned file (only update latest.json) */
  skipVersioning?: boolean;
}

/**
 * Result from listing analysis versions.
 */
export interface AnalysisVersion {
  /** S3 key for this version */
  key: string;
  /** Timestamp extracted from filename */
  timestamp: string;
  /** ISO date string */
  date: string;
}
