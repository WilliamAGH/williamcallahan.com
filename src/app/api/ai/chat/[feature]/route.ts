import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/utils/api-utils";
import logger from "@/lib/utils/logger";
import { aiFeatureIdentifierSchema } from "@/types/schemas/ai-feature";
import { validateRequest, buildRagContextForChat } from "./chat-helpers";
import { buildChatPipeline } from "./upstream-pipeline";
import { createSseStreamResponse } from "./sse-stream";
import { persistAnalysisAfterResponse, resolveAnalysisPersistTarget } from "./analysis-persistence";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ feature: string }> },
): Promise<NextResponse> {
  const { feature: rawFeature } = await context.params;
  const featureResult = aiFeatureIdentifierSchema.safeParse(rawFeature);
  if (!featureResult.success) {
    return NextResponse.json(
      { error: "Invalid feature parameter" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  const feature = featureResult.data;

  const validationResult = await validateRequest(request, feature);
  if (validationResult instanceof NextResponse) return validationResult;

  const ctx = validationResult;

  try {
    const ragResult = await buildRagContextForChat(feature, ctx.parsedBody);
    // The SSE handler, not the browser connection, decides when the upstream stops:
    // a started analysis outlives its viewer so the finished result is persisted.
    const upstreamAbort = new AbortController();
    const pipeline = buildChatPipeline({ feature, ctx, ragResult, signal: upstreamAbort.signal });

    const analysisTarget = resolveAnalysisPersistTarget(feature, ctx.parsedBody);

    const { response, completion } = createSseStreamResponse({
      request,
      ...pipeline,
      ragContextStatus: ragResult.status,
      upstreamAbort,
      finishAfterDisconnect: analysisTarget !== null,
    });
    if (analysisTarget) persistAnalysisAfterResponse(analysisTarget, completion);
    return response;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    logger.error("[AI Chat] Pipeline construction failed", { feature, error: detail });
    const errorResponse = NextResponse.json(
      { error: "AI service initialization failed" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
    return errorResponse;
  }
}
