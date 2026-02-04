/**
 * RAG (Retrieval-Augmented Generation) Types
 * @module types/rag
 * @description
 * Type definitions for RAG context building and retrieval.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Static Context Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Static context built from site data for system prompt injection.
 */
export interface StaticContext {
  biography: string;
  qualifications: string[];
  technicalFocus: Array<{ area: string; skills: string[] }>;
  currentProjects: Array<{ name: string; description: string; url: string }>;
  socialLinks: Array<{ platform: string; url: string }>;
  homePageHighlights: string[];
  contactSummary: string;
  contactLinks: Array<{ label: string; url: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic Retrieval Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single dynamic search result for RAG context.
 */
export interface DynamicResult {
  scope: string;
  title: string;
  description: string;
  url: string;
  score: number;
}

/**
 * Formatted context ready for system prompt injection.
 */
export interface FormattedContext {
  text: string;
  tokenEstimate: number;
}

/**
 * Options for context formatting.
 */
export interface FormatContextOptions {
  maxTokens?: number;
}

/**
 * Valid scope names for RAG content retrieval.
 * This type ensures scope patterns and searchers have matching keys.
 */
export type RagScopeName =
  | "projects"
  | "blog"
  | "investments"
  | "experience"
  | "education"
  | "books"
  | "bookmarks"
  | "tags"
  | "analysis"
  | "thoughts";

/**
 * Search function type for scope searchers.
 */
export type ScopeSearcher = (
  query: string,
) => Promise<Array<{ title: string; description?: string; url: string; score: number }>>;

/**
 * Options for dynamic content retrieval.
 */
export interface RetrieveOptions {
  maxResults?: number;
  timeoutMs?: number;
}

/**
 * Result type that includes status metadata for caller awareness.
 * Callers can distinguish between "no matches found" vs "error during retrieval".
 */
export interface RetrieveResult {
  results: DynamicResult[];
  status: "success" | "partial" | "failed";
  /** Scopes that failed during retrieval (for debugging) */
  failedScopes?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Context Builder Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Options for building RAG context.
 */
export interface BuildContextOptions {
  maxTokens?: number;
  timeoutMs?: number;
  skipDynamic?: boolean;
}

/**
 * Result from building RAG context.
 */
export interface BuildContextResult {
  contextText: string;
  tokenEstimate: number;
  searchResultCount: number;
  searchDurationMs: number;
  /** Status of dynamic retrieval: success, partial (some scopes failed), failed, or skipped */
  retrievalStatus: "success" | "partial" | "failed" | "skipped";
  /** Scopes that failed during retrieval (if any) */
  failedScopes?: string[];
}
