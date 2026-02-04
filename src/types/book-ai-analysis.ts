/**
 * Book AI Analysis Types
 * @module types/book-ai-analysis
 * @description
 * Non-schema types for the book AI analysis feature.
 */

import type { BookAiAnalysisResponse } from "./schemas/book-ai-analysis";
import type { CachedAnalysis } from "./ai-analysis";
import type { Book } from "./schemas/book";

// ─────────────────────────────────────────────────────────────────────────────
// Context Extraction Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracted context from a book for LLM prompt construction.
 * Contains the pertinent fields needed to generate an analysis.
 */
export interface BookAnalysisContext {
  /** Book title */
  title: string;
  /** Book subtitle if available */
  subtitle: string | null;
  /** Author names */
  authors: string[];
  /** Book description */
  description: string | null;
  /** Genre tags */
  genres: string[];
  /** Publisher name */
  publisher: string | null;
  /** Publication year */
  publishedYear: string | null;
  /** Audio narrators if audiobook */
  narrators: string[];
  /** Existing AI summary from book data */
  existingSummary: string | null;
  /** User's personal thoughts */
  thoughts: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component State Types
// ─────────────────────────────────────────────────────────────────────────────

/** Possible states for the AI analysis component */
export type BookAnalysisStatus = "idle" | "loading" | "success" | "error";

/** State object for the AI analysis component */
export interface BookAnalysisState {
  status: BookAnalysisStatus;
  analysis: BookAiAnalysisResponse | null;
  error: string | null;
}

/** Initial state for the AI analysis component */
export const INITIAL_BOOK_ANALYSIS_STATE: BookAnalysisState = {
  status: "idle",
  analysis: null,
  error: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Component Props Types
// ─────────────────────────────────────────────────────────────────────────────

/** Props for the BookAiAnalysis component */
export interface BookAiAnalysisProps {
  book: Book;
  className?: string;
  /** Auto-trigger analysis on mount (default: true) */
  autoTrigger?: boolean;
  /** Pre-cached analysis from S3 (if available) */
  initialAnalysis?: CachedAnalysis<BookAiAnalysisResponse> | null;
}
