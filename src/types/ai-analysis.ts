/**
 * AI Analysis Domain Types
 * @module types/ai-analysis
 * @description
 * Domain types for AI analysis persistence across different content types.
 */

import type { ComponentType, ReactNode } from "react";
import type { z } from "zod/v4";
import type { AnalysisMetadata } from "@/types/schemas/ai-analysis-persisted";
import type { OpenAiCompatibleResponseFormat } from "@/types/schemas/ai-openai-compatible";

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

// ─────────────────────────────────────────────────────────────────────────────
// Terminal UI Types
// ─────────────────────────────────────────────────────────────────────────────

export type AnalysisStatus = "idle" | "loading" | "success" | "error";

export interface AnalysisState<T> {
  status: AnalysisStatus;
  analysis: T | null;
  error: string | null;
}

export interface AnalysisSectionProps {
  label: string;
  children: ReactNode;
  index: number;
  accentColor?: string;
  /** Skip initial animation for SSR/cached content */
  skipAnimation?: boolean;
}

export interface TerminalListItemProps {
  children: ReactNode;
  index: number;
  /** Skip initial animation for SSR/cached content */
  skipAnimation?: boolean;
}

export interface TechDetailProps {
  label: string;
  value: string;
}

export interface AnalysisRenderHelpers {
  AnalysisSection: ComponentType<AnalysisSectionProps>;
  TerminalListItem: ComponentType<TerminalListItemProps>;
  TechDetail: ComponentType<TechDetailProps>;
  /** Whether to skip animations (for cached/SSR content) */
  skipAnimation: boolean;
}

export interface AiAnalysisTerminalProps<TEntity, TAnalysis> {
  /** The entity being analyzed */
  entity: TEntity;
  /** Unique identifier for the entity (used for caching) */
  entityId: string;
  /** AI feature name for API routing (e.g., "bookmark-analysis") */
  featureName: string;
  /** Domain key for S3 persistence (e.g., "bookmarks") */
  persistenceKey: AnalysisDomain;
  /** Loading messages to cycle through */
  loadingMessages: string[];
  /** Extract context from entity for prompts */
  extractContext: (entity: TEntity) => unknown;
  /** Build the system prompt */
  buildSystemPrompt: () => string;
  /** Build the user prompt from context */
  buildUserPrompt: (context: unknown) => string;
  /** Structured output format passed to upstream chat completions */
  responseFormat: OpenAiCompatibleResponseFormat;
  /** Zod schema for validating AI response */
  responseSchema: z.ZodType<TAnalysis>;
  /** Render the analysis content */
  renderAnalysis: (analysis: TAnalysis, helpers: AnalysisRenderHelpers) => ReactNode;
  /** Category extractor for header badge */
  getCategory?: (analysis: TAnalysis) => string;
  /** Footer icon */
  footerIcon?: ReactNode;
  /** Footer text after "Analysis complete" */
  footerText?: string;
  /** Auto-trigger analysis on mount */
  autoTrigger?: boolean;
  /** Pre-loaded analysis from cache */
  initialAnalysis?: { analysis: TAnalysis } | null;
  /** Additional CSS classes */
  className?: string;
  /** Start with analysis content collapsed (default: false) */
  defaultCollapsed?: boolean;
}
