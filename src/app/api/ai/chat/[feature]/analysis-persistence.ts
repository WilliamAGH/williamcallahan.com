import "server-only";

import * as Sentry from "@sentry/nextjs";
import { after } from "next/server";
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
 * Persist a finished analysis once its run completes, even after the viewer left.
 *
 * The write runs inside `after()` because the SSE run outlives the route handler:
 * Next flushes `revalidateTag` calls only when the handler returns or inside an
 * `after()` callback (`withExecuteRevalidates`), so a write made from the stream
 * itself would leave the analysis cache serving the previous record.
 */
export function persistAnalysisAfterResponse(
  target: AnalysisPersistTarget,
  completion: Promise<string | null>,
): void {
  after(async () => {
    const validatedText = await completion;
    if (validatedText !== null) await persistFinishedAnalysis(target, validatedText);
  });
}

/**
 * The upstream runner already validated the text (`validateAnalysisOutput` returns
 * the schema output serialized). A failed write is reported, never surfaced as a
 * generation failure: the viewer, if still present, already holds a valid analysis.
 */
async function persistFinishedAnalysis(
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
    Sentry.captureException(error, {
      extra: logContext,
      tags: { feature: "ai-analysis-persist" },
    });
  }
}
