import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/utils/api-utils";
import logger from "@/lib/utils/logger";
import { aiFeatureIdentifierSchema } from "@/types/schemas/ai-chat";
import { validateRequest, buildRagContextForChat } from "./chat-helpers";
import { buildChatPipeline } from "./upstream-pipeline";
import { createSseStreamResponse } from "./sse-stream";

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
    const pipeline = buildChatPipeline({ feature, ctx, ragResult, signal: request.signal });

    const response = createSseStreamResponse({
      request,
      ...pipeline,
      ragContextStatus: ragResult.status,
    });
    if (ctx.systemStatus) {
      response.headers.set("X-System-Status", ctx.systemStatus);
    }
    return response;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    logger.error("[AI Chat] Pipeline construction failed", { feature, error: detail });
    const errorResponse = NextResponse.json(
      { error: "AI service initialization failed" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
    if (ctx.systemStatus) {
      errorResponse.headers.set("X-System-Status", ctx.systemStatus);
    }
    return errorResponse;
  }
}
