import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/utils/api-utils";
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
  const ragResult = await buildRagContextForChat(feature, ctx.parsedBody);
  const pipeline = buildChatPipeline({ feature, ctx, ragResult, signal: request.signal });

  return createSseStreamResponse({
    request,
    ...pipeline,
    ragContextStatus: ragResult.status,
  });
}
