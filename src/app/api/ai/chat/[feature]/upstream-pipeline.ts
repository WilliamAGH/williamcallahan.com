/**
 * AI Chat Upstream Pipeline
 *
 * Constructs the message pipeline, upstream queue, and execution context
 * for AI chat requests. Extracted from route.ts for SRP compliance.
 *
 * @module api/ai/chat/upstream-pipeline
 */

import "server-only";

import {
  buildChatCompletionsUrl,
  resolveOpenAiCompatibleFeatureConfig,
} from "@/lib/ai/openai-compatible/feature-config";
import { callOpenAiCompatibleChatCompletions } from "@/lib/ai/openai-compatible/openai-compatible-client";
import { getUpstreamRequestQueue } from "@/lib/ai/openai-compatible/upstream-request-queue";
import { buildChatMessages } from "@/lib/ai/openai-compatible/chat-messages";
import type { ValidatedRequestContext, RagContextStatus, ChatLogContext } from "./chat-helpers";

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

/** Pipeline result containing everything needed to dispatch an AI chat request */
export type ChatPipeline = {
  queue: ReturnType<typeof getUpstreamRequestQueue>;
  upstreamKey: string;
  priority: number;
  startTime: number;
  logContext: ChatLogContext;
  runUpstream: () => Promise<string>;
};

/**
 * Build the complete chat pipeline: messages, queue, log context, and upstream runner
 */
export function buildChatPipeline(
  feature: string,
  ctx: ValidatedRequestContext,
  ragResult: { augmentedPrompt: string | undefined; status: RagContextStatus },
  signal: AbortSignal,
): ChatPipeline {
  const featureSystemPrompt = ragResult.augmentedPrompt
    ? `${FEATURE_SYSTEM_PROMPTS[feature]}\n\n${ragResult.augmentedPrompt}`
    : FEATURE_SYSTEM_PROMPTS[feature];

  const messages = buildChatMessages({
    featureSystemPrompt,
    system: ctx.parsedBody.system,
    messages: ctx.parsedBody.messages,
    userText: ctx.parsedBody.userText,
  });

  const config = resolveOpenAiCompatibleFeatureConfig(feature);
  const url = buildChatCompletionsUrl(config.baseUrl);
  const upstreamKey = `${url}::${config.model}`;
  const queue = getUpstreamRequestQueue({ key: upstreamKey, maxParallel: config.maxParallel });
  const priority = ctx.parsedBody.priority ?? 0;

  const logContext: ChatLogContext = {
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
      signal,
    });
    return upstream.choices[0]?.message.content ?? "";
  };

  return { queue, upstreamKey, priority, startTime: Date.now(), logContext, runUpstream };
}
