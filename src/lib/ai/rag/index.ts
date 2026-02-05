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
import { buildInventoryContext } from "./inventory-context";
import { retrieveRelevantContent } from "./dynamic-retriever";
import type { BuildContextOptions, BuildContextResult, DynamicResult } from "@/types/rag";
import { getMonotonicTime } from "@/lib/utils";

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
  const includeInventory = options?.includeInventory ?? false;
  const inventoryMaxTokens = options?.inventoryMaxTokens ?? 2000;
  const skipInventoryCache = options?.skipInventoryCache ?? false;

  const staticCtx = getStaticContext();
  const searchStart = getMonotonicTime();
  let inventoryText = "";
  let inventoryTokenEstimate: number | undefined;
  let inventoryStatus: BuildContextResult["inventoryStatus"] | undefined;
  let inventorySections: BuildContextResult["inventorySections"] | undefined;

  if (includeInventory) {
    const inventory = await buildInventoryContext({
      maxTokens: inventoryMaxTokens,
      includeDynamic: true,
      skipCache: skipInventoryCache,
    });
    inventoryText = inventory.text;
    inventoryTokenEstimate = inventory.tokenEstimate;
    inventoryStatus = inventory.status;
    inventorySections = inventory.sections;
  }

  // Retrieve dynamic content unless skipped
  let dynamicResults: DynamicResult[] = [];
  let retrievalStatus: "success" | "partial" | "failed" | "skipped" = "skipped";
  let failedScopes: string[] | undefined;

  if (!skipDynamic) {
    const retrieval = await retrieveRelevantContent(userQuery, { timeoutMs });
    dynamicResults = retrieval.results;
    retrievalStatus = retrieval.status;
    failedScopes = retrieval.failedScopes;
  }

  const searchDurationMs = getMonotonicTime() - searchStart;

  // Format combined context
  const { text, tokenEstimate } = formatContext(staticCtx, dynamicResults, inventoryText, {
    maxTokens,
  });

  return {
    contextText: text,
    tokenEstimate,
    searchResultCount: dynamicResults.length,
    searchDurationMs,
    retrievalStatus,
    ...(failedScopes && { failedScopes }),
    ...(inventoryStatus && { inventoryStatus }),
    ...(inventoryTokenEstimate !== undefined && { inventoryTokenEstimate }),
    ...(inventorySections && { inventorySections }),
  };
}

// Re-export types for consumers
export type { StaticContext, DynamicResult, FormattedContext } from "@/types/rag";
