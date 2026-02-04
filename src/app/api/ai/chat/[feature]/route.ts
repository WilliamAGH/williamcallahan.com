import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { validateRequest, buildRagContextForChat, wantsEventStream } from "./chat-helpers";
import { buildChatPipeline } from "./upstream-pipeline";
import { createSseStreamResponse } from "./sse-stream";
import { handleJsonResponse } from "./json-response";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ feature: string }> },
): Promise<NextResponse> {
  const { feature } = await context.params;

  const validationResult = await validateRequest(request, feature);
  if (validationResult instanceof NextResponse) return validationResult;

  const ctx = validationResult;
  const ragResult = await buildRagContextForChat(feature, ctx.parsedBody);
  const pipeline = buildChatPipeline(feature, ctx, ragResult, request.signal);

  if (wantsEventStream(request)) {
    return createSseStreamResponse({
      request,
      ...pipeline,
      ragContextStatus: ragResult.status,
    });
  }

  return handleJsonResponse({
    ...pipeline,
    ragContextStatus: ragResult.status,
    signal: request.signal,
  });
}
