import "server-only";

import {
  buildChatCompletionsUrl,
  buildResponsesUrl,
  resolveOpenAiCompatibleFeatureConfig,
} from "@/lib/ai/openai-compatible/feature-config";
import {
  callOpenAiCompatibleChatCompletions,
  callOpenAiCompatibleResponses,
  streamOpenAiCompatibleChatCompletions,
  streamOpenAiCompatibleResponses,
} from "@/lib/ai/openai-compatible/openai-compatible-client";
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
  OpenAiCompatibleChatCompletionsRequest,
  OpenAiCompatibleChatMessage,
} from "@/types/schemas/ai-openai-compatible";
import {
  SEARCH_BOOKMARKS_RESPONSE_TOOL,
  SEARCH_BOOKMARKS_TOOL,
  dispatchResponseToolCalls,
  dispatchToolCalls,
  extractSearchBookmarkToolCalls,
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
import { emitDeferredContentEvents, isModelLoadFailure } from "./upstream-error";

const MAX_TOOL_TURNS = 2;

async function executeChatCompletionsTurn(
  requestMessages: OpenAiCompatibleChatMessage[],
  params: UpstreamTurnParams,
): Promise<UpstreamTurnOutcome> {
  const { turnConfig, signal, toolChoice, hasToolSupport, onStreamEvent } = params;
  const request: OpenAiCompatibleChatCompletionsRequest = {
    model: turnConfig.model,
    messages: requestMessages,
    tools: hasToolSupport ? [SEARCH_BOOKMARKS_TOOL] : undefined,
    tool_choice: toolChoice,
    parallel_tool_calls: hasToolSupport ? false : undefined,
    temperature: params.temperature,
    top_p: params.topP,
    max_tokens: params.maxTokens,
    ...(params.reasoningEffort != null ? { reasoning_effort: params.reasoningEffort } : {}),
  };
  const callArgs = { baseUrl: turnConfig.baseUrl, apiKey: turnConfig.apiKey, request, signal };

  let startMeta: { id: string; model: string } | null = null;
  const upstream = onStreamEvent
    ? await streamOpenAiCompatibleChatCompletions({
        ...callArgs,
        onStart: (meta) => {
          startMeta = meta;
        },
      })
    : await callOpenAiCompatibleChatCompletions(callArgs);

  const assistantMessage = upstream.choices[0]?.message;
  if (!assistantMessage) return { kind: "empty" };

  const toolCalls = assistantMessage.tool_calls ?? [];
  if (toolCalls.length === 0) {
    const text = assistantMessage.content?.trim() || assistantMessage.refusal?.trim();
    if (text && onStreamEvent) {
      emitDeferredContentEvents({
        text,
        startMeta,
        apiMode: "chat_completions",
        onStreamEvent,
      });
    }
    return { kind: "content", text };
  }

  const assistantMsg: OpenAiCompatibleChatMessage = {
    role: "assistant",
    ...(assistantMessage.content ? { content: assistantMessage.content } : {}),
    tool_calls: toolCalls,
  };
  const dispatch = await dispatchToolCalls(toolCalls);
  return {
    kind: "tool_calls",
    newMessages: [assistantMsg, ...dispatch.responseMessages],
    observedResults: dispatch.observedResults,
  };
}

async function executeResponsesTurn(
  requestMessages: OpenAiCompatibleChatMessage[],
  params: UpstreamTurnParams,
): Promise<UpstreamTurnOutcome> {
  const { turnConfig, signal, toolChoice, hasToolSupport, onStreamEvent } = params;
  const request = {
    model: turnConfig.model,
    input: requestMessages,
    tools: hasToolSupport ? [SEARCH_BOOKMARKS_RESPONSE_TOOL] : undefined,
    tool_choice: toolChoice,
    parallel_tool_calls: hasToolSupport ? false : undefined,
    temperature: params.temperature,
    top_p: params.topP,
    max_output_tokens: params.maxTokens,
    ...(params.reasoningEffort !== null ? { reasoning: { effort: params.reasoningEffort } } : {}),
  };

  const callArgs = { baseUrl: turnConfig.baseUrl, apiKey: turnConfig.apiKey, request, signal };

  let startMeta: { id: string; model: string } | null = null;
  const response = onStreamEvent
    ? await streamOpenAiCompatibleResponses({
        ...callArgs,
        onStart: (meta) => {
          startMeta = meta;
        },
      })
    : await callOpenAiCompatibleResponses(callArgs);

  const toolCalls = extractSearchBookmarkToolCalls(response.output);
  if (toolCalls.length === 0) {
    const text = response.output_text.trim();
    if (text && onStreamEvent) {
      emitDeferredContentEvents({ text, startMeta, apiMode: "responses", onStreamEvent });
    }
    return { kind: "content", text };
  }

  const assistantMsg: OpenAiCompatibleChatMessage = {
    role: "assistant",
    tool_calls: toolCalls.map((tc) => ({
      id: tc.call_id,
      type: "function",
      function: { name: tc.name, arguments: tc.arguments },
    })),
  };
  const dispatch = await dispatchResponseToolCalls(toolCalls);
  const toolMessages: OpenAiCompatibleChatMessage[] = dispatch.outputs.map((output) => ({
    role: "tool" as const,
    tool_call_id: output.call_id,
    content: typeof output.output === "string" ? output.output : JSON.stringify(output.output),
  }));

  return {
    kind: "tool_calls",
    newMessages: [assistantMsg, ...toolMessages],
    observedResults: dispatch.observedResults,
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
  const modelCandidates = config.model
    .split(",")
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate.length > 0);
  const primaryModel = modelCandidates[0] ?? config.model;
  const fallbackModel = modelCandidates[1];
  const apiMode: AiUpstreamApiMode =
    ctx.parsedBody.apiMode === "responses" ? "responses" : "chat_completions";
  const upstreamUrl =
    apiMode === "responses"
      ? buildResponsesUrl(config.baseUrl)
      : buildChatCompletionsUrl(config.baseUrl);
  const upstreamKey = `${upstreamUrl}::${primaryModel}`;
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

  return { queue, upstreamKey, priority, startTime: Date.now(), logContext, runUpstream };
}
