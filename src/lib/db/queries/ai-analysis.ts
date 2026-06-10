/**
 * AI Analysis Database Queries
 * @module lib/db/queries/ai-analysis
 * @description
 * Read-only queries for AI analysis data stored in PostgreSQL.
 * Canonical read path for AI analysis payloads.
 */

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/connection";
import { envLogger } from "@/lib/utils/env-logger";
import { aiAnalysisLatest, aiAnalysisVersions } from "@/lib/db/schema/ai-analysis";
import {
  persistedBookmarkAnalysisSchema,
  persistedBookAnalysisSchema,
  persistedProjectAnalysisSchema,
} from "@/types/schemas/ai-analysis-persisted";
import type { AnalysisDomain, AnalysisVersion, CachedAnalysis } from "@/types/ai-analysis";

// ─────────────────────────────────────────────────────────────────────────────
// Domain-specific Schema Selection
// ─────────────────────────────────────────────────────────────────────────────

const schemaForDomain = (domain: AnalysisDomain) => {
  switch (domain) {
    case "bookmarks":
      return persistedBookmarkAnalysisSchema;
    case "books":
      return persistedBookAnalysisSchema;
    case "projects":
      return persistedProjectAnalysisSchema;
  }
};

/**
 * Parse a raw JSONB payload through the domain-specific Zod schema.
 * Returns the validated CachedAnalysis or null on validation failure.
 * Failures are logged: a stored payload that stops validating would
 * otherwise be indistinguishable from missing data.
 */
const parsePayloadForDomain = (
  domain: AnalysisDomain,
  entityId: string,
  rawPayload: unknown,
): CachedAnalysis<unknown> | null => {
  const result = schemaForDomain(domain).safeParse(rawPayload);
  if (result.success) {
    return result.data;
  }

  envLogger.log(
    "Stored analysis payload failed schema validation",
    {
      domain,
      entityId,
      issues: result.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    },
    { category: "AiAnalysis" },
  );
  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Query Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read the latest analysis for a (domain, entityId) pair.
 * Returns the validated payload or null if not found / validation fails.
 */
export async function readLatestAnalysis(
  domain: AnalysisDomain,
  entityId: string,
): Promise<CachedAnalysis<unknown> | null> {
  const rows = await db
    .select({ payload: aiAnalysisLatest.payload })
    .from(aiAnalysisLatest)
    .where(and(eq(aiAnalysisLatest.domain, domain), eq(aiAnalysisLatest.entityId, entityId)))
    .limit(1);

  const firstRow = rows[0];
  if (!firstRow) {
    return null;
  }

  return parsePayloadForDomain(domain, entityId, firstRow.payload);
}

/**
 * List all entity IDs that have a latest analysis for the given domain.
 * Returns IDs sorted alphabetically.
 */
export async function listAnalysisItemIdsFromDb(domain: AnalysisDomain): Promise<string[]> {
  const rows = await db
    .select({ entityId: aiAnalysisLatest.entityId })
    .from(aiAnalysisLatest)
    .where(eq(aiAnalysisLatest.domain, domain))
    .orderBy(aiAnalysisLatest.entityId);

  return rows.map((row) => row.entityId);
}

/**
 * List all versions of an entity's analysis, sorted newest first.
 * Returns AnalysisVersion[] with generatedAt as the key/timestamp/date fields.
 */
export async function listAnalysisVersionsFromDb(
  domain: AnalysisDomain,
  entityId: string,
): Promise<AnalysisVersion[]> {
  const rows = await db
    .select({ generatedAt: aiAnalysisVersions.generatedAt })
    .from(aiAnalysisVersions)
    .where(and(eq(aiAnalysisVersions.domain, domain), eq(aiAnalysisVersions.entityId, entityId)))
    .orderBy(desc(aiAnalysisVersions.generatedAt));

  return rows.map((row) => ({
    key: `${domain}/${entityId}/versions/${row.generatedAt}`,
    timestamp: row.generatedAt,
    date: row.generatedAt,
  }));
}

/**
 * Check if a latest analysis exists for the given (domain, entityId) pair.
 * Faster than readLatestAnalysis when only existence is needed.
 */
export async function hasAnalysisInDb(domain: AnalysisDomain, entityId: string): Promise<boolean> {
  const rows = await db
    .select({ entityId: aiAnalysisLatest.entityId })
    .from(aiAnalysisLatest)
    .where(and(eq(aiAnalysisLatest.domain, domain), eq(aiAnalysisLatest.entityId, entityId)))
    .limit(1);

  return rows.length > 0;
}
