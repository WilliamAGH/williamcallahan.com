import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import {
  buildChatCompletionsUrl,
  resolveOpenAiCompatibleFeatureConfig,
} from "@/lib/ai/openai-compatible/feature-config";
import { getUpstreamRequestQueue } from "@/lib/ai/openai-compatible/upstream-request-queue";

const NO_STORE_HEADERS: HeadersInit = { "Cache-Control": "no-store" };

/**
 * GET /api/ai/queue/[feature]
 *
 * Returns the current queue state for a specific AI feature.
 * Used by client components to decide whether to auto-trigger AI requests
 * based on current queue load.
 *
 * Response: { running: number, pending: number, maxParallel: number }
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ feature: string }> },
): Promise<NextResponse> {
  const { feature } = await context.params;

  const config = resolveOpenAiCompatibleFeatureConfig(feature);
  const url = buildChatCompletionsUrl(config.baseUrl);
  const upstreamKey = `${url}::${config.model}`;
  const queue = getUpstreamRequestQueue({ key: upstreamKey, maxParallel: config.maxParallel });

  return NextResponse.json(queue.snapshot, { status: 200, headers: NO_STORE_HEADERS });
}
