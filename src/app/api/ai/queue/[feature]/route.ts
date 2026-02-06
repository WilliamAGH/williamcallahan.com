import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod/v4";
import {
  buildChatCompletionsUrl,
  buildResponsesUrl,
  resolveOpenAiCompatibleFeatureConfig,
} from "@/lib/ai/openai-compatible/feature-config";
import { getUpstreamRequestQueue } from "@/lib/ai/openai-compatible/upstream-request-queue";
import { NO_STORE_HEADERS, preventCaching, requireCloudflareHeaders } from "@/lib/utils/api-utils";
import { aiUpstreamApiModeSchema } from "@/types/schemas/ai-openai-compatible";

const featureParamSchema = z
  .string()
  .min(1)
  .max(50)
  .regex(/^[a-z0-9-]+$/);

/**
 * GET /api/ai/queue/[feature]
 *
 * Returns the current queue state for a specific AI feature.
 * Used by client components to decide whether to auto-trigger AI requests
 * based on current queue load.
 *
 * Optional query: ?apiMode=chat_completions|responses
 *
 * Response: { running: number, pending: number, maxParallel: number }
 *
 * Note: This endpoint is intentionally unauthenticated as it only exposes
 * queue depth counts (integers), not sensitive data. Similar to health checks.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ feature: string }> },
): Promise<NextResponse> {
  preventCaching();
  const cloudflareResponse = requireCloudflareHeaders(request.headers, {
    route: "/api/ai/queue",
    additionalHeaders: NO_STORE_HEADERS,
  });
  if (cloudflareResponse) {
    return cloudflareResponse;
  }

  try {
    const { feature } = await context.params;
    const validatedFeature = featureParamSchema.parse(feature);
    const rawApiMode = request.nextUrl.searchParams.get("apiMode");
    const resolvedApiMode = rawApiMode
      ? aiUpstreamApiModeSchema.parse(rawApiMode)
      : "chat_completions";

    const config = resolveOpenAiCompatibleFeatureConfig(validatedFeature);
    const url =
      resolvedApiMode === "responses"
        ? buildResponsesUrl(config.baseUrl)
        : buildChatCompletionsUrl(config.baseUrl);
    const upstreamKey = `${url}::${config.model}`;
    const queue = getUpstreamRequestQueue({ key: upstreamKey, maxParallel: config.maxParallel });

    return NextResponse.json(queue.snapshot, { status: 200, headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid feature parameter" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
