/**
 * AI Analysis S3 Writer (Server-only)
 * @module lib/ai-analysis/writer.server
 * @description
 * Server-side writer for persisting AI analysis to S3.
 * Writes both latest.json and versioned files for history.
 */

import "server-only";

import { writeJsonS3 } from "@/lib/s3/json";
import { envLogger } from "@/lib/utils/env-logger";
import { buildLatestAnalysisKey, buildVersionedAnalysisKey } from "./paths";
import type { AnalysisDomain, CachedAnalysis, PersistAnalysisOptions } from "./types";
import type { AnalysisMetadata } from "@/types/schemas/ai-analysis-persisted";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_MODEL_VERSION = "v1";

// ─────────────────────────────────────────────────────────────────────────────
// Main Writer Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist analysis to S3 with metadata envelope.
 * Writes both latest.json (for fast reads) and a versioned file (for history).
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
  const now = new Date();

  // Build metadata envelope
  const metadata: AnalysisMetadata = {
    generatedAt: now.toISOString(),
    modelVersion: options?.modelVersion ?? DEFAULT_MODEL_VERSION,
    ...(options?.contentHash && { contentHash: options.contentHash }),
  };

  const persistedData: CachedAnalysis<T> = {
    metadata,
    analysis,
  };

  const latestKey = buildLatestAnalysisKey(domain, id);

  try {
    // Write latest.json first (primary read path)
    await writeJsonS3(latestKey, persistedData);

    envLogger.log(
      "Persisted analysis (latest)",
      { domain, id, key: latestKey },
      { category: "AiAnalysis" },
    );

    // Write versioned file for history (unless skipped)
    if (!options?.skipVersioning) {
      const versionedKey = buildVersionedAnalysisKey(domain, id, now);
      await writeJsonS3(versionedKey, persistedData);

      envLogger.log(
        "Persisted analysis (versioned)",
        { domain, id, key: versionedKey },
        { category: "AiAnalysis" },
      );
    }
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
 * Update only the latest.json without creating a new version.
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
