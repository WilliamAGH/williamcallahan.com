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
  currentProjects: Array<{ name: string; description: string; url: string; externalUrl?: string }>;
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
 * Pagination configuration for inventory sections.
 */
export interface InventoryPaginationConfig {
  /** Items per page (default: 25) */
  pageSize?: number;
  /** 1-indexed page number (default: 1) */
  page?: number;
  /** Filter to a specific section */
  section?: InventorySectionName;
}

/**
 * Pagination metadata for an inventory section.
 */
export interface InventoryPaginationMeta {
  section: InventorySectionName;
  page: number;
  totalPages: number;
  totalItems: number;
  itemsOnPage: number;
  hasMore: boolean;
}

/**
 * Per-section pagination data stored in conversation state.
 */
export interface SectionPaginationData {
  currentPage: number;
  totalPages: number;
  totalItems: number;
}

/**
 * Pagination state tracked per conversation for cursor navigation.
 */
export interface InventoryPaginationState {
  /** Per-section pagination positions */
  sections: Partial<Record<InventorySectionName, SectionPaginationData>>;
  /** Last section the user interacted with (for "next" command) */
  lastRequestedSection?: InventorySectionName;
  /** Timestamp for cache expiration */
  updatedAt: number;
}

/**
 * Options for building a full inventory catalog for RAG injection.
 */
export interface BuildInventoryContextOptions {
  maxTokens?: number;
  includeDynamic?: boolean;
  skipCache?: boolean;
  /** Conversation ID for stateful pagination */
  conversationId?: string;
  /** Pagination configuration */
  pagination?: InventoryPaginationConfig;
  /** True when user requested next page (e.g., said "next" or "more") */
  isPaginationRequest?: boolean;
}

/**
 * Inventory build status for RAG catalog sections.
 */
export type InventoryStatus = "success" | "partial" | "failed";

/**
 * Known inventory sections included in the RAG catalog.
 */
export type InventorySectionName =
  | "investments"
  | "projects"
  | "experience"
  | "education"
  | "certifications"
  | "courses"
  | "blog"
  | "bookmarks"
  | "books"
  | "tags"
  | "analysis"
  | "thoughts";

/**
 * Summary metadata for an inventory section.
 */
export interface InventorySectionSummary {
  name: InventorySectionName;
  totalItems: number;
  includedItems: number;
  status: InventoryStatus;
  truncated: boolean;
}

/**
 * Internal section build payload used when assembling the inventory catalog text.
 */
export interface InventorySectionBuildResult {
  name: InventorySectionName;
  totalItems: number;
  includedItems: number;
  status: InventoryStatus;
  truncated: boolean;
  lines: string[];
}

/**
 * Result payload for inventory context generation.
 */
export interface InventoryContextResult {
  text: string;
  tokenEstimate: number;
  status: InventoryStatus;
  failedSections?: InventorySectionName[];
  sections: InventorySectionSummary[];
  /** Pagination metadata when pagination is active */
  pagination?: InventoryPaginationMeta[];
  /** Human-readable hint for AI to communicate pagination state */
  paginationHint?: string;
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
  includeInventory?: boolean;
  inventoryMaxTokens?: number;
  skipInventoryCache?: boolean;
  /** Conversation ID for stateful pagination */
  conversationId?: string;
  /** Pagination configuration */
  inventoryPagination?: InventoryPaginationConfig;
  /** True when user requested next page */
  isPaginationRequest?: boolean;
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
  inventoryStatus?: InventoryStatus;
  inventoryTokenEstimate?: number;
  inventorySections?: InventorySectionSummary[];
  /** Pagination metadata when pagination is active */
  inventoryPagination?: InventoryPaginationMeta[];
  /** Human-readable hint for AI about pagination state */
  inventoryPaginationHint?: string;
}
