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
} from "./bookmark-tool";

const FEATURE_SYSTEM_PROMPTS: Record<string, string> = {
  terminal_chat: `You are a helpful assistant in a terminal interface on williamcallahan.com, the personal website of William Callahan (software engineer, investor, entrepreneur).

Response style:
- Keep responses short and conversational (2-4 sentences typical, expand only when necessary)
- Use plain text only - no markdown, no HTML, no formatting symbols like ** or #, except for search result link lines
- For lists, use simple dashes: "- item one" on new lines
- Be friendly but concise - this is a terminal, not a document
- When asked about William (William Callahan) or the site, share relevant context naturally
- Use the INVENTORY CATALOG section to answer list questions; do not invent items not in the catalog
- If asked for "all" items, respond in pages of ~25 lines and ask if they want the next page
- When SEARCH RESULTS FOR YOUR QUERY is present, treat it as preloaded context from the server
- For bookmark search requests, call the "search_bookmarks" tool before answering
- Never claim "I can search" or "searching now" after a user asks to search; actually call the tool
- Tool-call procedure: (1) call "search_bookmarks" with {"query": "...", "maxResults": 5}, (2) read tool results, (3) answer from those results only
- After tool results arrive, answer with clickable markdown lines in this exact format: "- [Title](/bookmarks/slug)"
- Use only URLs returned by the tool
- If no relevant result exists, clearly say none were found and suggest a refined query`,
};

const FEATURE_DEFAULT_TEMPERATURE: Record<string, number> = {
  terminal_chat: 0,
};

const MAX_TOOL_TURNS = 2;

function isTerminalChat(feature: string): boolean {
  return feature === "terminal_chat";
}

function resolveApiMode(mode: AiUpstreamApiMode | undefined): AiUpstreamApiMode {
  return mode === "responses" ? "responses" : "chat_completions";
}

function resolveFeatureSystemPrompt(
  feature: string,
  augmentedPrompt: string | undefined,
): string | undefined {
  const base: string | undefined = FEATURE_SYSTEM_PROMPTS[feature];
  if (base && augmentedPrompt) return `${base}\n\n${augmentedPrompt}`;
  return base ?? augmentedPrompt;
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
  const logMessages: Array<{ role: string; content: string }> = [];
  for (const message of messages) {
    if (typeof message.content === "string") {
      logMessages.push({ role: message.role, content: message.content });
    }
  }
  return logMessages;
}

async function executeChatCompletionsTurn(
  requestMessages: OpenAiCompatibleChatMessage[],
  params: UpstreamTurnParams,
): Promise<UpstreamTurnOutcome> {
  const { turnConfig, signal, toolChoice, hasToolSupport, temperature, onStreamEvent } = params;
  const request: OpenAiCompatibleChatCompletionsRequest = {
    model: turnConfig.model,
    messages: requestMessages,
    tools: hasToolSupport ? [SEARCH_BOOKMARKS_TOOL] : undefined,
    tool_choice: toolChoice,
    ...(temperature !== undefined ? { temperature } : {}),
  };

  const streamStart: { id?: string; model?: string } = {};
  const upstream = onStreamEvent
    ? await streamOpenAiCompatibleChatCompletions({
        baseUrl: turnConfig.baseUrl,
        apiKey: turnConfig.apiKey,
        request,
        signal,
        onStart: ({ id, model }) => {
          streamStart.id = id;
          streamStart.model = model;
        },
      })
    : await callOpenAiCompatibleChatCompletions({
        baseUrl: turnConfig.baseUrl,
        apiKey: turnConfig.apiKey,
        request,
        signal,
      });

  const assistantMessage = upstream.choices[0]?.message;
  if (!assistantMessage) return { kind: "empty" };

  const toolCalls = assistantMessage.tool_calls ?? [];
  if (toolCalls.length === 0) {
    const text = assistantMessage.content?.trim();
    if (text && onStreamEvent) {
      if (streamStart.id && streamStart.model) {
        onStreamEvent({
          event: "message_start",
          data: { id: streamStart.id, model: streamStart.model, apiMode: "chat_completions" },
        });
      }
      onStreamEvent({ event: "message_delta", data: { delta: text } });
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
  const { turnConfig, signal, toolChoice, hasToolSupport, temperature, onStreamEvent } = params;
  const request = {
    model: turnConfig.model,
    input: requestMessages,
    tools: hasToolSupport ? [SEARCH_BOOKMARKS_RESPONSE_TOOL] : undefined,
    tool_choice: toolChoice,
    ...(temperature !== undefined ? { temperature } : {}),
  };
  const streamStart: { id?: string; model?: string } = {};
  const response = onStreamEvent
    ? await streamOpenAiCompatibleResponses({
        baseUrl: turnConfig.baseUrl,
        apiKey: turnConfig.apiKey,
        request,
        signal,
        onStart: ({ id, model }) => {
          streamStart.id = id;
          streamStart.model = model;
        },
      })
    : await callOpenAiCompatibleResponses({
        baseUrl: turnConfig.baseUrl,
        apiKey: turnConfig.apiKey,
        request,
        signal,
      });

  const toolCalls = extractSearchBookmarkToolCalls(response.output);
  if (toolCalls.length === 0) {
    const text = response.output_text.trim();
    if (text && onStreamEvent) {
      if (streamStart.id && streamStart.model) {
        onStreamEvent({
          event: "message_start",
          data: { id: streamStart.id, model: streamStart.model, apiMode: "responses" },
        });
      }
      onStreamEvent({ event: "message_delta", data: { delta: text } });
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
  messages: OpenAiCompatibleChatMessage[],
  model: string,
  apiMode: AiUpstreamApiMode,
  priority: number,
): ChatLogContext {
  return {
    feature,
    conversationId: ctx.parsedBody.conversationId,
    clientIp: ctx.clientIp,
    userAgent: ctx.userAgent,
    originHost: ctx.originHost,
    pagePath: ctx.pagePath,
    messages: toLoggableMessages(messages),
    model,
    apiMode,
    priority,
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
  const apiMode = resolveApiMode(ctx.parsedBody.apiMode);
  const upstreamUrl =
    apiMode === "responses"
      ? buildResponsesUrl(config.baseUrl)
      : buildChatCompletionsUrl(config.baseUrl);
  const upstreamKey = `${upstreamUrl}::${config.model}`;
  const queue = getUpstreamRequestQueue({ key: upstreamKey, maxParallel: config.maxParallel });
  const priority = ctx.parsedBody.priority ?? 0;
  const temperature =
    typeof ctx.parsedBody.temperature === "number"
      ? ctx.parsedBody.temperature
      : FEATURE_DEFAULT_TEMPERATURE[feature];
  const latestUserMessage = resolveLatestUserMessage(ctx.parsedBody);
  const hasToolSupport = isTerminalChat(feature);
  const forceBookmarkTool = hasToolSupport && matchesBookmarkSearchPattern(latestUserMessage);
  const logContext = buildLogContext(feature, ctx, messages, config.model, apiMode, priority);
  const turnConfig = { model: config.model, baseUrl: config.baseUrl, apiKey: config.apiKey };

  const runUpstream = async (
    onStreamEvent?: (event: AiChatModelStreamEvent) => void,
  ): Promise<string> => {
    const requestMessages: OpenAiCompatibleChatMessage[] = [...messages];
    const toolObservedResults: Array<{ title: string; url: string }> = [];
    const emitMessageDone = (message: string): string => {
      onStreamEvent?.({ event: "message_done", data: { message } });
      return message;
    };

    for (let turn = 0; turn < MAX_TOOL_TURNS; turn += 1) {
      const turnParams: UpstreamTurnParams = {
        turnConfig,
        signal,
        toolChoice: resolveToolChoice(hasToolSupport, forceBookmarkTool, turn),
        hasToolSupport,
        temperature,
        onStreamEvent,
      };
      const outcome =
        apiMode === "chat_completions"
          ? await executeChatCompletionsTurn(requestMessages, turnParams)
          : await executeResponsesTurn(requestMessages, turnParams);

      if (outcome.kind === "empty") break;
      if (outcome.kind === "content") {
        if (forceBookmarkTool && turn === 0 && latestUserMessage) {
          const fallback = await runDeterministicBookmarkFallback(feature, latestUserMessage);
          return emitMessageDone(fallback);
        }
        if (outcome.text) return emitMessageDone(outcome.text);
        break;
      }
      requestMessages.push(...outcome.newMessages);
      toolObservedResults.push(...outcome.observedResults);
    }

    if (toolObservedResults.length > 0 || forceBookmarkTool) {
      return emitMessageDone(formatBookmarkResultsAsLinks(toolObservedResults));
    }

    return emitMessageDone("");
  };

  return { queue, upstreamKey, priority, startTime: Date.now(), logContext, runUpstream };
}
