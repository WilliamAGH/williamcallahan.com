import "server-only";

import { persistAnalysis } from "@/lib/ai-analysis/writer.server";
import { resolveDatabaseAccessMode } from "@/lib/db/connection";
import logger from "@/lib/utils/logger";
import type { AnalysisPersistTarget } from "@/types/features/ai-chat";
import type { ParsedRequestBody } from "@/types/schemas/ai-chat";
import { ANALYSIS_DOMAIN_BY_FEATURE, ANALYSIS_SCHEMA_BY_FEATURE } from "./analysis-output-config";
import { isAnalysisFeature } from "./analysis-output-validation";

export function resolveAnalysisPersistTarget(
  feature: string,
  parsedBody: ParsedRequestBody,
): AnalysisPersistTarget | null {
  if (!isAnalysisFeature(feature) || !parsedBody.analysisEntityId) return null;
  return { feature, entityId: parsedBody.analysisEntityId };
}

/**
 * Persist an analysis the upstream runner already validated (`validateAnalysisOutput`
 * returns the schema output serialized), so a visitor who leaves mid-stream does not
 * discard a finished generation. A failed write is logged, never surfaced as a
 * generation failure: the caller already holds a valid analysis.
 */
export async function persistFinishedAnalysis(
  target: AnalysisPersistTarget,
  validatedText: string,
): Promise<void> {
  const domain = ANALYSIS_DOMAIN_BY_FEATURE[target.feature];
  const logContext = { feature: target.feature, domain, entityId: target.entityId };

  const databaseAccess = resolveDatabaseAccessMode();
  if (!databaseAccess.allowWrites) {
    logger.info("[AI Analysis] Persistence skipped in read-only environment", {
      ...logContext,
      environment: databaseAccess.environment,
    });
    return;
  }

  try {
    const analysis = ANALYSIS_SCHEMA_BY_FEATURE[target.feature].parse(JSON.parse(validatedText));
    await persistAnalysis(domain, target.entityId, analysis);
  } catch (error) {
    logger.error("[AI Analysis] Failed to persist finished analysis", {
      ...logContext,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
