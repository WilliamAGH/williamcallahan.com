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
  StreamStartMeta,
  UpstreamTurnOutcome,
  UpstreamTurnParams,
  ValidatedRequestContext,
} from "@/types/features/ai-chat";
import type {
  AiUpstreamApiMode,
  OpenAiCompatibleChatCompletionsRequest,
  OpenAiCompatibleChatMessage,
  ReasoningEffort,
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
} from "./bookmark-tool";
import { resolveFeatureSystemPrompt, resolveModelParams } from "./feature-defaults";
import { isModelLoadFailure } from "./upstream-error";

const MAX_TOOL_TURNS = 2;

function isTerminalChat(feature: string): boolean {
  return feature === "terminal_chat";
}

function resolveApiMode(mode: AiUpstreamApiMode | undefined): AiUpstreamApiMode {
  return mode === "responses" ? "responses" : "chat_completions";
}

function resolveToolChoice(
  hasToolSupport: boolean,
  forceBookmarkTool: boolean,
  turn: number,
): "required" | "auto" | undefined {
  if (!hasToolSupport) return undefined;
  return forceBookmarkTool && turn === 0 ? "required" : "auto";
}

function toLoggableMessages(
  messages: OpenAiCompatibleChatMessage[],
): Array<{ role: string; content: string }> {
  return messages
    .filter((m): m is typeof m & { content: string } => typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content }));
}

/** Emit start/delta events after a turn resolves with final content. */
function emitDeferredContentEvents(
  text: string,
  startMeta: StreamStartMeta | null,
  apiMode: AiUpstreamApiMode,
  onStreamEvent: (event: AiChatModelStreamEvent) => void,
): void {
  if (startMeta) {
    onStreamEvent({
      event: "message_start",
      data: { id: startMeta.id, model: startMeta.model, apiMode },
    });
  }
  onStreamEvent({ event: "message_delta", data: { delta: text } });
}

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
    temperature: params.temperature,
    top_p: params.topP,
    max_tokens: params.maxTokens,
    ...(params.reasoningEffort != null ? { reasoning_effort: params.reasoningEffort } : {}),
  };
  const callArgs = { baseUrl: turnConfig.baseUrl, apiKey: turnConfig.apiKey, request, signal };

  let startMeta: StreamStartMeta | null = null;
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
      emitDeferredContentEvents(text, startMeta, "chat_completions", onStreamEvent);
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
    temperature: params.temperature,
    top_p: params.topP,
    max_output_tokens: params.maxTokens,
    ...(params.reasoningEffort !== null ? { reasoning: { effort: params.reasoningEffort } } : {}),
  };

  const callArgs = { baseUrl: turnConfig.baseUrl, apiKey: turnConfig.apiKey, request, signal };

  let startMeta: StreamStartMeta | null = null;
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
      emitDeferredContentEvents(text, startMeta, "responses", onStreamEvent);
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

function resolveLatestUserMessage(
  parsedBody: ValidatedRequestContext["parsedBody"],
): string | undefined {
  return (
    parsedBody.userText?.trim() ||
    parsedBody.messages
      ?.filter((message) => message.role === "user")
      .map((message) => message.content.trim())
      .filter((content) => content.length > 0)
      .slice(-1)[0]
  );
}

function buildLogContext(
  feature: string,
  ctx: ValidatedRequestContext,
  msgs: OpenAiCompatibleChatMessage[],
  model: string,
  apiMode: AiUpstreamApiMode,
  priority: number,
  temperature: number,
  reasoningEffort: ReasoningEffort | null,
): ChatLogContext {
  return {
    feature,
    conversationId: ctx.parsedBody.conversationId,
    clientIp: ctx.clientIp,
    userAgent: ctx.userAgent,
    originHost: ctx.originHost,
    pagePath: ctx.pagePath,
    messages: toLoggableMessages(msgs),
    model,
    apiMode,
    priority,
    temperature,
    reasoningEffort,
  };
}

export function buildChatPipeline(
  feature: string,
  ctx: ValidatedRequestContext,
  ragResult: { augmentedPrompt: string | undefined; status: RagContextStatus },
  signal: AbortSignal,
): ChatPipeline {
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
  const apiMode = resolveApiMode(ctx.parsedBody.apiMode);
  const upstreamUrl =
    apiMode === "responses"
      ? buildResponsesUrl(config.baseUrl)
      : buildChatCompletionsUrl(config.baseUrl);
  const upstreamKey = `${upstreamUrl}::${primaryModel}`;
  const queue = getUpstreamRequestQueue({ key: upstreamKey, maxParallel: config.maxParallel });
  const priority = ctx.parsedBody.priority ?? 0;
  const modelParams = resolveModelParams(feature, ctx.parsedBody);
  const latestUserMessage = resolveLatestUserMessage(ctx.parsedBody);
  const hasToolSupport = isTerminalChat(feature);
  const forceBookmarkTool = hasToolSupport && matchesBookmarkSearchPattern(latestUserMessage);
  const logContext = buildLogContext(
    feature,
    ctx,
    messages,
    primaryModel,
    apiMode,
    priority,
    modelParams.temperature,
    modelParams.reasoningEffort,
  );
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
        toolChoice: resolveToolChoice(hasToolSupport, forceBookmarkTool, turn),
        hasToolSupport,
        temperature: modelParams.temperature,
        topP: modelParams.topP,
        reasoningEffort: modelParams.reasoningEffort,
        maxTokens: modelParams.maxTokens,
        onStreamEvent,
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
        // Only use deterministic fallback when model ignored the forced tool
        // (returned empty/refusal content), not when it returned valid text.
        if (forceBookmarkTool && turn === 0 && !outcome.text && latestUserMessage) {
          console.warn(
            "[upstream-pipeline] Model ignored forced tool, using deterministic fallback",
            {
              feature,
            },
          );
          const fallback = await runDeterministicBookmarkFallback(feature, latestUserMessage);
          return emitMessageDone(fallback);
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
