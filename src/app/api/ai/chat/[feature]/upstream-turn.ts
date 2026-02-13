/**
 * Upstream Turn Executors
 *
 * Execute a single chat-completions or responses turn against an upstream
 * OpenAI-compatible provider, handling streaming delta forwarding, tool-call
 * dispatch, and deferred content emission.
 *
 * @module api/ai/chat/upstream-turn
 */

import "server-only";

import {
  callOpenAiCompatibleChatCompletions,
  callOpenAiCompatibleResponses,
  streamOpenAiCompatibleChatCompletions,
  streamOpenAiCompatibleResponses,
} from "@/lib/ai/openai-compatible/openai-compatible-client";
import type { UpstreamTurnOutcome, UpstreamTurnParams } from "@/types/features/ai-chat";
import type {
  OpenAiCompatibleChatCompletionsRequest,
  OpenAiCompatibleChatMessage,
} from "@/types/schemas/ai-openai-compatible";
import { sanitizeModelOutput } from "@/lib/ai/openai-compatible/think-tag-parser";
import { getChatCompletionsTools, getResponsesTools } from "./tool-registry";
import {
  dispatchToolCallsByName,
  dispatchResponseToolCallsByName,
  extractToolCallsFromResponseOutput,
} from "./tool-dispatch";
import { emitDeferredContentEvents } from "./upstream-error";

/** Approximate characters per token for thinking-token estimation */
const APPROX_CHARS_PER_TOKEN = 4;

export async function executeChatCompletionsTurn(
  requestMessages: OpenAiCompatibleChatMessage[],
  params: UpstreamTurnParams,
): Promise<UpstreamTurnOutcome> {
  const { turnConfig, signal, toolChoice, hasToolSupport, onStreamEvent } = params;
  const request: OpenAiCompatibleChatCompletionsRequest = {
    model: turnConfig.model,
    messages: requestMessages,
    tools: hasToolSupport ? getChatCompletionsTools() : undefined,
    tool_choice: toolChoice,
    parallel_tool_calls: hasToolSupport ? false : undefined,
    temperature: params.temperature,
    top_p: params.topP,
    max_tokens: params.maxTokens,
    ...(params.reasoningEffort == null ? {} : { reasoning_effort: params.reasoningEffort }),
    ...(params.responseFormat ? { response_format: params.responseFormat } : {}),
  };
  const callArgs = { baseUrl: turnConfig.baseUrl, apiKey: turnConfig.apiKey, request, signal };

  let startMeta: { id: string; model: string } | null = null;
  let emittedStartEvent = false;
  let emittedDeltaEvent = false;
  let accumulatedThinking = "";
  const upstream = onStreamEvent
    ? await streamOpenAiCompatibleChatCompletions({
        ...callArgs,
        onStart: (meta) => {
          startMeta = meta;
        },
        onDelta: (delta) => {
          if (!emittedStartEvent && startMeta) {
            onStreamEvent({
              event: "message_start",
              data: { id: startMeta.id, model: startMeta.model, apiMode: "chat_completions" },
            });
            emittedStartEvent = true;
          }
          emittedDeltaEvent = true;
          onStreamEvent({ event: "message_delta", data: { delta } });
        },
        onThinkingDelta: (delta) => {
          accumulatedThinking += delta;
          onStreamEvent({ event: "thinking_delta", data: { delta } });
        },
      })
    : await callOpenAiCompatibleChatCompletions(callArgs);

  if (accumulatedThinking.length > 0 && onStreamEvent) {
    onStreamEvent({
      event: "thinking_done",
      data: {
        text: accumulatedThinking,
        tokenCount: Math.ceil(accumulatedThinking.length / APPROX_CHARS_PER_TOKEN),
      },
    });
  }

  const assistantMessage = upstream.choices[0]?.message;
  if (!assistantMessage) {
    console.warn("[upstream-turn] Upstream returned empty choices array", {
      model: turnConfig.model,
      responseId: upstream.id,
      choicesCount: upstream.choices?.length ?? 0,
    });
    return { kind: "empty" };
  }

  const toolCalls = assistantMessage.tool_calls ?? [];
  if (toolCalls.length === 0) {
    const rawContent = assistantMessage.content?.trim();
    const content = rawContent ? sanitizeModelOutput(rawContent) : rawContent;
    const refusal = assistantMessage.refusal?.trim();
    const text = content ? content : refusal;
    if (text && onStreamEvent && !emittedDeltaEvent) {
      emitDeferredContentEvents({
        text,
        startMeta,
        apiMode: "chat_completions",
        onStreamEvent,
        includeStartEvent: !emittedStartEvent,
      });
    }
    return { kind: "content", text };
  }

  const assistantMsg: OpenAiCompatibleChatMessage = {
    role: "assistant",
    ...(assistantMessage.content ? { content: assistantMessage.content } : {}),
    tool_calls: toolCalls,
  };

  const dispatch = await dispatchToolCallsByName(toolCalls);
  return {
    kind: "tool_calls",
    newMessages: [assistantMsg, ...dispatch.responseMessages],
    observedResults: dispatch.observedResults,
  };
}

export async function executeResponsesTurn(
  requestMessages: OpenAiCompatibleChatMessage[],
  params: UpstreamTurnParams,
): Promise<UpstreamTurnOutcome> {
  const { turnConfig, signal, toolChoice, hasToolSupport, onStreamEvent } = params;
  const request = {
    model: turnConfig.model,
    input: requestMessages,
    tools: hasToolSupport ? getResponsesTools() : undefined,
    tool_choice: toolChoice,
    parallel_tool_calls: hasToolSupport ? false : undefined,
    temperature: params.temperature,
    top_p: params.topP,
    max_output_tokens: params.maxTokens,
    ...(params.reasoningEffort == null ? {} : { reasoning: { effort: params.reasoningEffort } }),
  };

  const callArgs = { baseUrl: turnConfig.baseUrl, apiKey: turnConfig.apiKey, request, signal };

  let startMeta: { id: string; model: string } | null = null;
  let emittedStartEvent = false;
  let emittedDeltaEvent = false;
  let accumulatedThinking = "";
  const response = onStreamEvent
    ? await streamOpenAiCompatibleResponses({
        ...callArgs,
        onStart: (meta) => {
          startMeta = meta;
        },
        onDelta: (delta) => {
          if (!emittedStartEvent && startMeta) {
            onStreamEvent({
              event: "message_start",
              data: { id: startMeta.id, model: startMeta.model, apiMode: "responses" },
            });
            emittedStartEvent = true;
          }
          emittedDeltaEvent = true;
          onStreamEvent({ event: "message_delta", data: { delta } });
        },
        onThinkingDelta: (delta) => {
          accumulatedThinking += delta;
          onStreamEvent({ event: "thinking_delta", data: { delta } });
        },
      })
    : await callOpenAiCompatibleResponses(callArgs);

  if (accumulatedThinking.length > 0 && onStreamEvent) {
    onStreamEvent({
      event: "thinking_done",
      data: {
        text: accumulatedThinking,
        tokenCount: Math.ceil(accumulatedThinking.length / APPROX_CHARS_PER_TOKEN),
      },
    });
  }

  const toolCalls = extractToolCallsFromResponseOutput(response.output);
  if (toolCalls.length === 0) {
    const text = sanitizeModelOutput(response.output_text.trim());
    if (text && onStreamEvent && !emittedDeltaEvent) {
      emitDeferredContentEvents({
        text,
        startMeta,
        apiMode: "responses",
        onStreamEvent,
        includeStartEvent: !emittedStartEvent,
      });
    }
    return { kind: "content", text };
  }

  const responseText = response.output_text.trim();
  const assistantMsg: OpenAiCompatibleChatMessage = {
    role: "assistant",
    ...(responseText.length > 0 ? { content: responseText } : {}),
    tool_calls: toolCalls.map((tc) => ({
      id: tc.call_id,
      type: "function",
      function: { name: tc.name, arguments: tc.arguments },
    })),
  };
  const dispatch = await dispatchResponseToolCallsByName(toolCalls);
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
