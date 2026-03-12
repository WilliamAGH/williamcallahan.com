/**
 * AI Analysis Database Writer (Server-only)
 * @module lib/ai-analysis/writer.server
 * @description
 * Server-side writer for persisting AI analysis to PostgreSQL.
 * Writes both a latest row and versioned history rows.
 */

import { persistAnalysisToDb } from "@/lib/db/mutations/ai-analysis";
import { cacheContextGuards } from "@/lib/cache";
import { envLogger } from "@/lib/utils/env-logger";
import { assertServerOnly } from "@/lib/utils/ensure-server-only";
import { buildAnalysisCacheTags, buildAnalysisVersionsCacheTags } from "./paths";
import type { AnalysisDomain, PersistAnalysisOptions } from "@/types/ai-analysis";

assertServerOnly();

// ─────────────────────────────────────────────────────────────────────────────
// Cache Invalidation
// ─────────────────────────────────────────────────────────────────────────────

const revalidateAnalysisCache = (domain: AnalysisDomain, id: string): void => {
  const tags = [
    ...buildAnalysisCacheTags(domain, id),
    ...buildAnalysisVersionsCacheTags(domain, id),
  ];
  cacheContextGuards.revalidateTag("AiAnalysis", ...tags);
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Writer Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist analysis to PostgreSQL with metadata envelope.
 * Writes both a latest row (for fast reads) and a versioned row (for history).
 *
 * @param domain - The analysis domain (e.g., "bookmarks")
 * @param id - The item ID
 * @param analysis - The analysis data to persist
 * @param options - Optional persistence options
 *
 * @example
 * ```ts
 * await persistAnalysis("bookmarks", "abc123", {
 *   summary: "...",
 *   category: "...",
 *   // ... rest of analysis
 * });
 * ```
 */
export async function persistAnalysis<T>(
  domain: AnalysisDomain,
  id: string,
  analysis: T,
  options?: PersistAnalysisOptions,
): Promise<void> {
  try {
    await persistAnalysisToDb(domain, id, analysis, {
      modelVersion: options?.modelVersion,
      contentHash: options?.contentHash,
      skipVersioning: options?.skipVersioning,
    });

    envLogger.log(
      "Persisted analysis to database",
      { domain, id, versioned: !options?.skipVersioning },
      { category: "AiAnalysis" },
    );

    revalidateAnalysisCache(domain, id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    envLogger.log(
      "Error persisting analysis",
      { domain, id, error: message },
      { category: "AiAnalysis" },
    );
    throw error;
  }
}

/**
 * Update only the latest analysis without creating a new version.
 * Useful for minor updates that don't warrant a full version.
 *
 * @param domain - The analysis domain
 * @param id - The item ID
 * @param analysis - The updated analysis data
 * @param options - Optional persistence options
 */
export async function updateLatestAnalysis<T>(
  domain: AnalysisDomain,
  id: string,
  analysis: T,
  options?: Omit<PersistAnalysisOptions, "skipVersioning">,
): Promise<void> {
  return persistAnalysis(domain, id, analysis, {
    ...options,
    skipVersioning: true,
  });
}
