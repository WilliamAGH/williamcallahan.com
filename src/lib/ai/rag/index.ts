/**
 * RAG (Retrieval-Augmented Generation) Module
 *
 * Provides context retrieval for grounding AI chat responses in real site content.
 * Combines static context (always present) with dynamic search results (query-specific).
 *
 * @module lib/ai/rag
 */

import { getStaticContext } from "./static-context";
import { formatContext } from "./context-formatter";
import { retrieveRelevantContent } from "./dynamic-retriever";

export interface BuildContextOptions {
  maxTokens?: number;
  timeoutMs?: number;
  skipDynamic?: boolean;
}

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

/**
 * Builds context for a user query by combining static site information
 * with dynamically retrieved search results.
 *
 * @param userQuery - The user's question or message
 * @param options - Optional settings for token budget, timeout, and search behavior
 * @returns Formatted context text with metrics
 */
export async function buildContextForQuery(
  userQuery: string,
  options?: BuildContextOptions,
): Promise<BuildContextResult> {
  const maxTokens = options?.maxTokens ?? 2000;
  const timeoutMs = options?.timeoutMs ?? 3000;
  const skipDynamic = options?.skipDynamic ?? false;

  const staticCtx = getStaticContext();
  const searchStart = Date.now();

  // Retrieve dynamic content unless skipped
  let dynamicResults: import("./context-formatter").DynamicResult[] = [];
  let retrievalStatus: "success" | "partial" | "failed" | "skipped" = "skipped";
  let failedScopes: string[] | undefined;

  if (!skipDynamic) {
    const retrieval = await retrieveRelevantContent(userQuery, { timeoutMs });
    dynamicResults = retrieval.results;
    retrievalStatus = retrieval.status;
    failedScopes = retrieval.failedScopes;
  }

  const searchDurationMs = Date.now() - searchStart;

  // Format combined context
  const { text, tokenEstimate } = formatContext(staticCtx, dynamicResults, { maxTokens });

  return {
    contextText: text,
    tokenEstimate,
    searchResultCount: dynamicResults.length,
    searchDurationMs,
    retrievalStatus,
    ...(failedScopes && { failedScopes }),
  };
}

// Re-export types for consumers
export type { StaticContext } from "./static-context";
export type { DynamicResult, FormattedContext } from "./context-formatter";
