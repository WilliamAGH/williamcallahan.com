import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import {
  buildChatCompletionsUrl,
  resolveOpenAiCompatibleFeatureConfig,
} from "@/lib/ai/openai-compatible/feature-config";
import { callOpenAiCompatibleChatCompletions } from "@/lib/ai/openai-compatible/openai-compatible-client";
import { getUpstreamRequestQueue } from "@/lib/ai/openai-compatible/upstream-request-queue";
import { buildChatMessages } from "@/lib/ai/openai-compatible/chat-messages";
import { NO_STORE_HEADERS } from "@/lib/utils/api-utils";
import {
  validateRequest,
  buildRagContextForChat,
  wantsEventStream,
  logSuccessfulChat,
  logFailedChat,
  formatErrorMessage,
  type ValidatedRequestContext,
} from "./chat-helpers";
import { createSseStreamResponse } from "./sse-stream";

// Feature-specific system prompts injected server-side
const FEATURE_SYSTEM_PROMPTS: Record<string, string> = {
  terminal_chat: `You are a helpful assistant in a terminal interface on williamcallahan.com, the personal website of William Callahan (software engineer, investor, entrepreneur).

Response style:
- Keep responses short and conversational (2-4 sentences typical, expand only when necessary)
- Use plain text only - no markdown, no HTML, no formatting symbols like ** or #
- For lists, use simple dashes: "- item one" on new lines
- Be friendly but concise - this is a terminal, not a document
- When asked about William or the site, share relevant context naturally`,
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ feature: string }> },
): Promise<NextResponse> {
  const { feature } = await context.params;

  // Validate request (cloudflare, origin, rate limit, auth, body parsing)
  const validationResult = await validateRequest(request, feature);
  if (validationResult instanceof NextResponse) {
    return validationResult;
  }
  const ctx: ValidatedRequestContext = validationResult;

  // Build RAG context for terminal_chat
  const ragResult = await buildRagContextForChat(feature, ctx.parsedBody);
  const featureSystemPrompt = ragResult.augmentedPrompt
    ? `${FEATURE_SYSTEM_PROMPTS[feature]}\n\n${ragResult.augmentedPrompt}`
    : FEATURE_SYSTEM_PROMPTS[feature];

  // Build chat messages
  const messages = buildChatMessages({
    featureSystemPrompt,
    system: ctx.parsedBody.system,
    messages: ctx.parsedBody.messages,
    userText: ctx.parsedBody.userText,
  });

  // Setup upstream config and queue
  const config = resolveOpenAiCompatibleFeatureConfig(feature);
  const url = buildChatCompletionsUrl(config.baseUrl);
  const upstreamKey = `${url}::${config.model}`;
  const queue = getUpstreamRequestQueue({ key: upstreamKey, maxParallel: config.maxParallel });
  const priority = ctx.parsedBody.priority ?? 0;

  const logContext = {
    feature,
    conversationId: ctx.parsedBody.conversationId,
    clientIp: ctx.clientIp,
    userAgent: ctx.userAgent,
    originHost: ctx.originHost,
    pagePath: ctx.pagePath,
    messages,
    model: config.model,
    priority,
  };

  const runUpstream = async () => {
    const upstream = await callOpenAiCompatibleChatCompletions({
      url,
      apiKey: config.apiKey,
      request: { model: config.model, messages, temperature: ctx.parsedBody.temperature },
      signal: request.signal,
    });
    return upstream.choices[0]?.message.content ?? "";
  };

  const startTime = Date.now();

  // SSE streaming path
  if (wantsEventStream(request)) {
    return createSseStreamResponse({
      request,
      queue,
      upstreamKey,
      priority,
      startTime,
      logContext,
      ragContextStatus: ragResult.status,
      runUpstream,
    });
  }

  // JSON response path
  return handleJsonResponse({
    queue,
    priority,
    startTime,
    logContext,
    ragContextStatus: ragResult.status,
    runUpstream,
    signal: request.signal,
  });
}

/** Handle non-SSE JSON response */
async function handleJsonResponse(config: {
  queue: ReturnType<typeof getUpstreamRequestQueue>;
  priority: number;
  startTime: number;
  logContext: Parameters<typeof logSuccessfulChat>[0];
  ragContextStatus: "included" | "partial" | "failed" | "not_applicable";
  runUpstream: () => Promise<string>;
  signal: AbortSignal;
}): Promise<NextResponse> {
  const { queue, priority, startTime, logContext, ragContextStatus, runUpstream, signal } = config;

  try {
    const enqueuedAtMs = Date.now();
    const task = queue.enqueue({ priority, signal, run: runUpstream });

    let startedAtMs: number | null = null;
    void task.started
      .then(() => {
        startedAtMs = Date.now();
        return undefined;
      })
      .catch(() => {
        // Rejection handled by await task.result
      });

    const assistantText = await task.result;

    const durationMs = Date.now() - startTime;
    const queueWaitMs = startedAtMs ? Math.max(0, startedAtMs - enqueuedAtMs) : 0;

    logSuccessfulChat(logContext, assistantText, durationMs, queueWaitMs);

    return NextResponse.json(
      {
        message: assistantText,
        ...(ragContextStatus !== "not_applicable" && { ragContext: ragContextStatus }),
      },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch (error: unknown) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logFailedChat(logContext, errorMessage, durationMs, 0);

    return NextResponse.json(
      { error: formatErrorMessage(error) },
      { status: 502, headers: NO_STORE_HEADERS },
    );
  }
}
