/**
 * Bookmark AI Analysis Types
 * @module types/bookmark-ai-analysis
 * @description
 * Non-schema types for the bookmark AI analysis feature.
 */

import type { BookmarkAiAnalysisResponse } from "./schemas/bookmark-ai-analysis";
import type { CachedAnalysis } from "./ai-analysis";

// ─────────────────────────────────────────────────────────────────────────────
// Context Extraction Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracted context from a bookmark for LLM prompt construction.
 * Contains the pertinent fields needed to generate an analysis.
 */
export interface BookmarkAnalysisContext {
  /** Bookmark title */
  title: string;
  /** Source URL */
  url: string;
  /** Short description */
  description: string | null;
  /** Tag names (not full tag objects) */
  tags: string[];
  /** Content author if available */
  author: string | null;
  /** Content publisher if available */
  publisher: string | null;
  /** Existing summary from bookmark source */
  existingSummary: string | null;
  /** User's personal note */
  note: string | null;
  /** Extracted and truncated text content from HTML */
  contentExcerpt: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component Props Types
// ─────────────────────────────────────────────────────────────────────────────

/** Props for the BookmarkAiAnalysis component */
export interface BookmarkAiAnalysisProps {
  bookmark: import("./bookmark").UnifiedBookmark;
  className?: string;
  /** Auto-trigger analysis on mount (default: true) */
  autoTrigger?: boolean;
  /** Pre-cached analysis from S3 (if available) */
  initialAnalysis?: CachedAnalysis<BookmarkAiAnalysisResponse>;
  /** Callback when analysis is successfully completed or loaded */
  onAnalysisComplete?: (analysis: BookmarkAiAnalysisResponse) => void;
}

/** Props for BookmarkDetail component */
export interface BookmarkDetailProps {
  bookmark: import("./bookmark").UnifiedBookmark;
  cachedAnalysis?: CachedAnalysis<BookmarkAiAnalysisResponse> | null;
}
