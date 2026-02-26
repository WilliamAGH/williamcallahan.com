/**
 * AI Analysis Database Mutations
 * @module lib/db/mutations/ai-analysis
 * @description
 * Write operations for AI analysis data in PostgreSQL.
 * Replaces S3 writeJsonS3 calls for both latest and versioned writes.
 *
 * All mutations enforce the production-only write guard via assertDatabaseWriteAllowed.
 */

import { assertDatabaseWriteAllowed, db } from "@/lib/db/connection";
import { aiAnalysisLatest, aiAnalysisVersions } from "@/lib/db/schema/ai-analysis";
import type { AnalysisDomain } from "@/types/ai-analysis";
import type { AnalysisMetadata } from "@/types/schemas/ai-analysis-persisted";

const DEFAULT_MODEL_VERSION = "v1";

/**
 * Build a JSONB-compatible payload record from typed metadata and analysis.
 * Constructs the Record<string, unknown> directly from known fields,
 * avoiding double-casts. The analysis value is spread into a nested record
 * so that JSONB receives only plain JSON-compatible data.
 */
const buildJsonbPayload = (
  metadata: AnalysisMetadata,
  analysis: unknown,
): Record<string, unknown> => ({
  metadata: {
    generatedAt: metadata.generatedAt,
    modelVersion: metadata.modelVersion,
    ...(metadata.contentHash !== undefined ? { contentHash: metadata.contentHash } : {}),
  },
  analysis,
});

// ─────────────────────────────────────────────────────────────────────────────
// Public Mutations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist analysis to PostgreSQL: upsert the latest row and optionally
 * insert a versioned history row.
 *
 * @param domain - The analysis domain (e.g., "bookmarks")
 * @param entityId - The item ID
 * @param analysis - The analysis data to persist
 * @param options - Optional persistence options
 */
export async function persistAnalysisToDb<T>(
  domain: AnalysisDomain,
  entityId: string,
  analysis: T,
  options?: {
    modelVersion?: string;
    contentHash?: string;
    skipVersioning?: boolean;
  },
): Promise<void> {
  assertDatabaseWriteAllowed(`persistAnalysisToDb:${domain}/${entityId}`);

  const now = Date.now();
  const metadata: AnalysisMetadata = {
    generatedAt: new Date(now).toISOString(),
    modelVersion: options?.modelVersion ?? DEFAULT_MODEL_VERSION,
    ...(options?.contentHash ? { contentHash: options.contentHash } : {}),
  };

  const payload = buildJsonbPayload(metadata, analysis);
  const contentHash = metadata.contentHash ?? null;

  await db
    .insert(aiAnalysisLatest)
    .values({
      domain,
      entityId,
      payload,
      generatedAt: metadata.generatedAt,
      modelVersion: metadata.modelVersion,
      contentHash,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [aiAnalysisLatest.domain, aiAnalysisLatest.entityId],
      set: {
        payload,
        generatedAt: metadata.generatedAt,
        modelVersion: metadata.modelVersion,
        contentHash,
        updatedAt: now,
      },
    });

  if (!options?.skipVersioning) {
    await db
      .insert(aiAnalysisVersions)
      .values({
        domain,
        entityId,
        generatedAt: metadata.generatedAt,
        payload,
        modelVersion: metadata.modelVersion,
        contentHash,
        createdAt: now,
      })
      .onConflictDoNothing();
  }
}

/**
 * Update only the latest analysis row without creating a versioned history entry.
 * Convenience wrapper around persistAnalysisToDb with skipVersioning=true.
 */
export async function updateLatestAnalysisInDb<T>(
  domain: AnalysisDomain,
  entityId: string,
  analysis: T,
  options?: {
    modelVersion?: string;
    contentHash?: string;
  },
): Promise<void> {
  return persistAnalysisToDb(domain, entityId, analysis, {
    ...options,
    skipVersioning: true,
  });
}
