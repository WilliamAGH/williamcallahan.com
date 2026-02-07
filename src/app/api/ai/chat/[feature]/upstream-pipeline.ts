/**
 * Chat Pipeline Builder
 *
 * Assembles validated request context, configuration, and a run closure into a
 * {@link ChatPipeline} that the route handler dispatches through the upstream
 * request queue.
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
  AiChatModelStreamEvent,
  ChatLogContext,
  ChatPipeline,
  RagContextStatus,
  UpstreamTurnOutcome,
  UpstreamTurnParams,
  ValidatedRequestContext,
} from "@/types/features/ai-chat";
import type {
  AiUpstreamApiMode,
  OpenAiCompatibleChatMessage,
} from "@/types/schemas/ai-openai-compatible";
import {
  formatBookmarkResultsAsLinks,
  matchesBookmarkSearchPattern,
  runDeterministicBookmarkFallback,
  sanitizeBookmarkLinksAgainstAllowlist,
} from "./bookmark-tool";
import {
  resolveFeatureSystemPrompt,
  resolveModelParams,
  resolveToolChoice,
} from "./feature-defaults";
import { isModelLoadFailure } from "./upstream-error";
import { executeChatCompletionsTurn, executeResponsesTurn } from "./upstream-turn";

// We intentionally keep explicit tool-turn orchestration because terminal bookmark search
// requires deterministic URL allowlisting and identical behavior across chat/responses modes.
const MAX_TOOL_TURNS = 2;

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
  const latestUserMessage =
    ctx.parsedBody.userText?.trim() ||
    ctx.parsedBody.messages
      ?.filter((message) => message.role === "user")
      .map((message) => message.content.trim())
      .filter((content) => content.length > 0)
      .slice(-1)[0];
  const hasToolSupport = feature === "terminal_chat";
  const forceBookmarkTool = hasToolSupport && matchesBookmarkSearchPattern(latestUserMessage);
  const logContext: ChatLogContext = {
    feature,
    conversationId: ctx.parsedBody.conversationId,
    clientIp: ctx.clientIp,
    userAgent: ctx.userAgent,
    originHost: ctx.originHost,
    pagePath: ctx.pagePath,
    messages: messages
      .filter(
        (message): message is typeof message & { content: string } =>
          typeof message.content === "string",
      )
      .map((message) => ({ role: message.role, content: message.content })),
    model: primaryModel,
    apiMode,
    priority,
    temperature: modelParams.temperature,
    reasoningEffort: modelParams.reasoningEffort,
  };
  const runUpstream = async (
    onStreamEvent?: (event: AiChatModelStreamEvent) => void,
  ): Promise<string> => {
    const requestMessages: OpenAiCompatibleChatMessage[] = [...messages];
    const toolObservedResults: Array<{ title: string; url: string }> = [];
    let activeModel = primaryModel;
    const emitMessageDone = (message: string): string => {
      onStreamEvent?.({ event: "message_done", data: { message } });
      return message;
    };

    let turn = 0;
    while (turn < MAX_TOOL_TURNS) {
      const turnParams: UpstreamTurnParams = {
        turnConfig: { model: activeModel, baseUrl: config.baseUrl, apiKey: config.apiKey },
        signal,
        toolChoice: resolveToolChoice({ hasToolSupport, forceBookmarkTool, turn }),
        hasToolSupport,
        temperature: modelParams.temperature,
        topP: modelParams.topP,
        reasoningEffort: modelParams.reasoningEffort,
        maxTokens: modelParams.maxTokens,
        responseFormat: ctx.parsedBody.response_format,
        onStreamEvent:
          forceBookmarkTool || toolObservedResults.length > 0 ? undefined : onStreamEvent,
      };
      let outcome: UpstreamTurnOutcome;
      try {
        outcome =
          apiMode === "chat_completions"
            ? await executeChatCompletionsTurn(requestMessages, turnParams)
            : await executeResponsesTurn(requestMessages, turnParams);
      } catch (error) {
        if (
          turn === 0 &&
          fallbackModel &&
          activeModel !== fallbackModel &&
          isModelLoadFailure(error)
        ) {
          console.warn("[upstream-pipeline] Primary model unavailable, retrying with fallback", {
            feature,
            failed: activeModel,
            fallback: fallbackModel,
          });
          activeModel = fallbackModel;
          continue; // retry same turn — while loop does not auto-increment
        }
        throw error;
      }

      if (outcome.kind === "empty") break;
      if (outcome.kind === "content") {
        if (
          forceBookmarkTool &&
          turn === 0 &&
          toolObservedResults.length === 0 &&
          latestUserMessage
        ) {
          console.warn(
            "[upstream-pipeline] Model ignored forced tool, using deterministic fallback",
            {
              feature,
            },
          );
          const fallback = await runDeterministicBookmarkFallback(feature, latestUserMessage);
          return emitMessageDone(fallback);
        }

        if (toolObservedResults.length > 0) {
          if (outcome.text) {
            const sanitized = sanitizeBookmarkLinksAgainstAllowlist({
              text: outcome.text,
              observedResults: toolObservedResults,
            });
            if (!sanitized.hadDisallowedLink && sanitized.allowedLinkCount > 0) {
              return emitMessageDone(sanitized.sanitizedText);
            }
            if (sanitized.hadDisallowedLink) {
              console.warn(
                "[upstream-pipeline] Model produced non-allowlisted bookmark URL; using deterministic tool results",
                {
                  feature,
                  observedResults: toolObservedResults.length,
                  allowedLinkCount: sanitized.allowedLinkCount,
                },
              );
            }
          }

          console.warn(
            "[upstream-pipeline] Ignoring model-authored bookmark links; using deterministic tool results",
            {
              feature,
              observedResults: toolObservedResults.length,
            },
          );
          return emitMessageDone(formatBookmarkResultsAsLinks(toolObservedResults));
        }

        if (outcome.text) return emitMessageDone(outcome.text);
        break;
      }
      requestMessages.push(...outcome.newMessages);
      toolObservedResults.push(...outcome.observedResults);
      turn += 1;
    }

    if (toolObservedResults.length > 0 || forceBookmarkTool) {
      return emitMessageDone(formatBookmarkResultsAsLinks(toolObservedResults));
    }

    console.warn("[upstream-pipeline] All turns exhausted without content", {
      feature,
      apiMode,
      turns: MAX_TOOL_TURNS,
    });
    return emitMessageDone("");
  };

  return { queue, priority, startTime: Date.now(), logContext, runUpstream };
}
