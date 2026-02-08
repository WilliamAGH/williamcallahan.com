/**
 * Chat Pipeline Builder
 *
 * Assembles validated request context, queue metadata, and an upstream
 * execution closure for the AI chat route.
 *
 * @module api/ai/chat/upstream-pipeline
 */

import "server-only";

import {
  buildUpstreamQueueKey,
  resolveOpenAiCompatibleFeatureConfig,
  resolvePreferredUpstreamModel,
} from "@/lib/ai/openai-compatible/feature-config";
import { getUpstreamRequestQueue } from "@/lib/ai/openai-compatible/upstream-request-queue";
import { buildChatMessages } from "@/lib/ai/openai-compatible/chat-messages";
import type {
  ChatLogContext,
  ChatPipeline,
  RagContextStatus,
  ValidatedRequestContext,
} from "@/types/features/ai-chat";
import type { AiUpstreamApiMode } from "@/types/schemas/ai-openai-compatible";
import { matchesBookmarkSearchPattern } from "./bookmark-tool";
import {
  resolveFeatureSystemPrompt,
  resolveModelParams,
  resolveToolConfig,
} from "./feature-defaults";
import { createUpstreamRunner } from "./upstream-runner";

function resolveLatestUserMessage(
  parsedBody: ValidatedRequestContext["parsedBody"],
): string | undefined {
  const directMessage = parsedBody.userText?.trim();
  if (directMessage && directMessage.length > 0) return directMessage;

  return parsedBody.messages
    ?.filter((message) => message.role === "user")
    .map((message) => message.content.trim())
    .filter((content) => content.length > 0)
    .slice(-1)[0];
}

function buildLogContext(args: {
  feature: string;
  ctx: ValidatedRequestContext;
  messages: ReturnType<typeof buildChatMessages>;
  primaryModel: string;
  apiMode: AiUpstreamApiMode;
  priority: number;
  modelParams: ReturnType<typeof resolveModelParams>;
}): ChatLogContext {
  return {
    feature: args.feature,
    conversationId: args.ctx.parsedBody.conversationId,
    clientIp: args.ctx.clientIp,
    userAgent: args.ctx.userAgent,
    originHost: args.ctx.originHost,
    pagePath: args.ctx.pagePath,
    messages: args.messages
      .filter(
        (message): message is typeof message & { content: string } =>
          typeof message.content === "string",
      )
      .map((message) => ({ role: message.role, content: message.content })),
    model: args.primaryModel,
    apiMode: args.apiMode,
    priority: args.priority,
    temperature: args.modelParams.temperature,
    reasoningEffort: args.modelParams.reasoningEffort,
  };
}

export function buildChatPipeline(params: {
  feature: string;
  ctx: ValidatedRequestContext;
  ragResult: { augmentedPrompt: string | undefined; status: RagContextStatus };
  signal: AbortSignal;
}): ChatPipeline {
  const { feature, ctx, ragResult, signal } = params;

  const messages = buildChatMessages({
    featureSystemPrompt: resolveFeatureSystemPrompt(feature, ragResult.augmentedPrompt),
    system: ctx.parsedBody.system,
    messages: ctx.parsedBody.messages,
    userText: ctx.parsedBody.userText,
  });

  const config = resolveOpenAiCompatibleFeatureConfig(feature);
  const { primaryModel, fallbackModel } = resolvePreferredUpstreamModel(config.model);
  const apiMode: AiUpstreamApiMode =
    ctx.parsedBody.apiMode === "responses" ? "responses" : "chat_completions";
  const upstreamKey = buildUpstreamQueueKey({
    baseUrl: config.baseUrl,
    model: config.model,
    apiMode,
  });
  const queue = getUpstreamRequestQueue({ key: upstreamKey, maxParallel: config.maxParallel });
  const priority = ctx.parsedBody.priority ?? 0;
  const modelParams = resolveModelParams(feature, ctx.parsedBody);
  const latestUserMessage = resolveLatestUserMessage(ctx.parsedBody);
  const hasToolSupport = resolveToolConfig(feature).enabled;
  const forceBookmarkTool = hasToolSupport && matchesBookmarkSearchPattern(latestUserMessage);

  const runUpstream = createUpstreamRunner({
    feature,
    apiMode,
    messages,
    parsedBody: ctx.parsedBody,
    config: { baseUrl: config.baseUrl, apiKey: config.apiKey },
    primaryModel,
    fallbackModel,
    hasToolSupport,
    forceBookmarkTool,
    latestUserMessage,
    modelParams,
    signal,
  });

  const logContext = buildLogContext({
    feature,
    ctx,
    messages,
    primaryModel,
    apiMode,
    priority,
    modelParams,
  });

  return { queue, priority, startTime: Date.now(), logContext, runUpstream };
}
