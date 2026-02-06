import "server-only";

import OpenAIClient from "openai";
import type {
  ChatCompletion,
  ChatCompletionAssistantMessageParam,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
  ChatCompletionSystemMessageParam,
  ChatCompletionTool,
  ChatCompletionToolMessageParam,
  ChatCompletionUserMessageParam,
} from "openai/resources/chat/completions";
import type {
  EasyInputMessage,
  ResponseCreateParamsNonStreaming,
  ResponseInput,
} from "openai/resources/responses/responses";
import {
  type OpenAiCompatibleChatCompletionsRequest,
  type OpenAiCompatibleChatCompletionsResponse,
  type OpenAiCompatibleResponsesResponse,
  openAiCompatibleChatCompletionsRequestSchema,
  openAiCompatibleChatCompletionsResponseSchema,
  openAiCompatibleResponsesResponseSchema,
  responsesOutputRefusalItemSchema,
  responsesOutputTextItemSchema,
} from "@/types/schemas/ai-openai-compatible";
import { buildOpenAiApiBaseUrl } from "@/lib/ai/openai-compatible/feature-config";
import logger from "@/lib/utils/logger";

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 3;
const API_KEY_FALLBACK = "openai-compatible-no-key";

const clientByConfig = new Map<string, OpenAIClient>();
const warnedMissingApiKeyFor = new Set<string>();

function toChatMessage(
  message: OpenAiCompatibleChatCompletionsRequest["messages"][number],
): ChatCompletionMessageParam {
  if (message.role === "system") {
    const systemMessage: ChatCompletionSystemMessageParam = {
      role: "system",
      content: message.content,
    };
    return systemMessage;
  }

  if (message.role === "user") {
    const userMessage: ChatCompletionUserMessageParam = {
      role: "user",
      content: message.content,
    };
    return userMessage;
  }

  if (message.role === "tool") {
    const toolMessage: ChatCompletionToolMessageParam = {
      role: "tool",
      tool_call_id: message.tool_call_id,
      content: message.content,
    };
    return toolMessage;
  }

  const assistantMessage: ChatCompletionAssistantMessageParam = { role: "assistant" };
  assistantMessage.content = typeof message.content === "string" ? message.content : null;
  if ("tool_calls" in message && message.tool_calls?.length) {
    assistantMessage.tool_calls = message.tool_calls.map((toolCall) => ({
      id: toolCall.id,
      type: "function",
      function: {
        name: toolCall.function.name,
        arguments: toolCall.function.arguments,
      },
    }));
  }
  return assistantMessage;
}

function toChatRequest(
  request: OpenAiCompatibleChatCompletionsRequest,
): ChatCompletionCreateParamsNonStreaming {
  const baseRequest: ChatCompletionCreateParamsNonStreaming = {
    model: request.model,
    messages: request.messages.map(toChatMessage),
  };

  if (request.temperature !== undefined) baseRequest.temperature = request.temperature;
  if (request.top_p !== undefined) baseRequest.top_p = request.top_p;
  if (request.max_tokens !== undefined) baseRequest.max_completion_tokens = request.max_tokens;
  if (request.reasoning_effort !== undefined)
    baseRequest.reasoning_effort = request.reasoning_effort;

  if (request.tools) {
    const chatTools: ChatCompletionTool[] = request.tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters ?? {},
      },
    }));
    baseRequest.tools = chatTools;
  }

  if (request.tool_choice) baseRequest.tool_choice = request.tool_choice;
  return baseRequest;
}

function toRequestOptions(args: {
  timeoutMs?: number;
  signal?: AbortSignal;
}): OpenAIClient.RequestOptions {
  const options: OpenAIClient.RequestOptions = {};
  if (typeof args.timeoutMs === "number") options.timeout = args.timeoutMs;
  if (args.signal) options.signal = args.signal;
  return options;
}

function toResponsesInput(
  messages: OpenAiCompatibleChatCompletionsRequest["messages"],
): ResponseInput {
  const items: ResponseInput = [];
  for (const message of messages) {
    if (message.role === "tool") {
      items.push({
        type: "function_call_output",
        call_id: message.tool_call_id,
        output: message.content,
      });
      continue;
    }

    if (message.role === "assistant" && message.tool_calls?.length) {
      if (typeof message.content === "string" && message.content.length > 0) {
        const assistantText: EasyInputMessage = {
          type: "message",
          role: "assistant",
          content: message.content,
        };
        items.push(assistantText);
      }
      for (const toolCall of message.tool_calls) {
        items.push({
          type: "function_call",
          call_id: toolCall.id,
          name: toolCall.function.name,
          arguments: toolCall.function.arguments,
        });
      }
      continue;
    }

    const role: EasyInputMessage["role"] = message.role;
    const content = message.role === "assistant" ? (message.content ?? "") : message.content;
    items.push({ type: "message", role, content });
  }

  return items;
}

function resolveClient(args: {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
}): OpenAIClient {
  const apiBaseUrl = buildOpenAiApiBaseUrl(args.baseUrl);
  const apiKey = args.apiKey?.trim();
  const clientKey = `${apiBaseUrl}::${apiKey ?? API_KEY_FALLBACK}`;
  const existingClient = clientByConfig.get(clientKey);
  if (existingClient) return existingClient;

  if (!apiKey && !warnedMissingApiKeyFor.has(clientKey)) {
    warnedMissingApiKeyFor.add(clientKey);
    logger.warn(
      "[AI] No upstream API key configured; using compatibility fallback token for OpenAI SDK client.",
      { baseUrl: args.baseUrl },
    );
  }

  const client = new OpenAIClient({
    apiKey: apiKey ?? API_KEY_FALLBACK,
    baseURL: apiBaseUrl,
    timeout: args.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxRetries: DEFAULT_MAX_RETRIES,
  });

  clientByConfig.set(clientKey, client);
  return client;
}

function validateChatRequest(request: OpenAiCompatibleChatCompletionsRequest) {
  return openAiCompatibleChatCompletionsRequestSchema.parse(request);
}

function deriveOutputTextFromResponsesOutput(output: unknown[]): string {
  const textChunks: string[] = [];
  const refusalChunks: string[] = [];
  for (const item of output) {
    const parsedOutputText = responsesOutputTextItemSchema.safeParse(item);
    if (parsedOutputText.success) {
      for (const content of parsedOutputText.data.content) {
        textChunks.push(content.text);
      }
      continue;
    }

    const parsedRefusal = responsesOutputRefusalItemSchema.safeParse(item);
    if (parsedRefusal.success) {
      for (const content of parsedRefusal.data.content) {
        refusalChunks.push(content.refusal);
      }
    }
  }
  return textChunks.length > 0 ? textChunks.join("") : refusalChunks.join("");
}

function normalizeResponsesOutputText<T extends { output: unknown[]; output_text?: string }>(
  response: T,
): T & { output_text: string } {
  const outputText =
    typeof response.output_text === "string"
      ? response.output_text
      : deriveOutputTextFromResponsesOutput(response.output);
  return { ...response, output_text: outputText };
}

export async function callOpenAiCompatibleChatCompletions(args: {
  baseUrl: string;
  apiKey?: string;
  request: OpenAiCompatibleChatCompletionsRequest;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<OpenAiCompatibleChatCompletionsResponse> {
  const validatedRequest = validateChatRequest(args.request);
  const client = resolveClient(args);
  const completion: ChatCompletion = await client.chat.completions.create(
    toChatRequest(validatedRequest),
    toRequestOptions(args),
  );
  return openAiCompatibleChatCompletionsResponseSchema.parse(completion);
}

export async function streamOpenAiCompatibleChatCompletions(args: {
  baseUrl: string;
  apiKey?: string;
  request: OpenAiCompatibleChatCompletionsRequest;
  timeoutMs?: number;
  signal?: AbortSignal;
  onStart?: (meta: { id: string; model: string }) => void;
  onDelta?: (delta: string) => void;
}): Promise<OpenAiCompatibleChatCompletionsResponse> {
  const validatedRequest = validateChatRequest(args.request);
  const client = resolveClient(args);
  const stream = client.chat.completions.stream(
    { ...toChatRequest(validatedRequest), stream: true },
    toRequestOptions(args),
  );

  let startEmitted = false;
  for await (const chunk of stream) {
    if (!startEmitted) {
      startEmitted = true;
      args.onStart?.({ id: chunk.id, model: chunk.model });
    }

    const delta = chunk.choices[0]?.delta?.content;
    if (typeof delta === "string" && delta.length > 0) args.onDelta?.(delta);
  }

  const completion = await stream.finalChatCompletion();
  return openAiCompatibleChatCompletionsResponseSchema.parse(completion);
}

export async function callOpenAiCompatibleResponses(args: {
  baseUrl: string;
  apiKey?: string;
  request: Omit<ResponseCreateParamsNonStreaming, "input"> & {
    input: OpenAiCompatibleChatCompletionsRequest["messages"];
  };
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<OpenAiCompatibleResponsesResponse> {
  const client = resolveClient(args);
  const response = await client.responses.create(
    {
      ...args.request,
      input: toResponsesInput(args.request.input),
    },
    toRequestOptions(args),
  );
  const normalizedResponse = normalizeResponsesOutputText(response);
  return openAiCompatibleResponsesResponseSchema.parse(normalizedResponse);
}

export async function streamOpenAiCompatibleResponses(args: {
  baseUrl: string;
  apiKey?: string;
  request: Omit<ResponseCreateParamsNonStreaming, "input"> & {
    input: OpenAiCompatibleChatCompletionsRequest["messages"];
  };
  timeoutMs?: number;
  signal?: AbortSignal;
  onStart?: (meta: { id: string; model: string }) => void;
  onDelta?: (delta: string) => void;
}): Promise<OpenAiCompatibleResponsesResponse> {
  const client = resolveClient(args);
  const stream = client.responses.stream(
    {
      ...args.request,
      input: toResponsesInput(args.request.input),
      stream: true,
    },
    toRequestOptions(args),
  );

  let startEmitted = false;
  for await (const event of stream) {
    if (!startEmitted && "response" in event && event.response?.id && event.response.model) {
      startEmitted = true;
      args.onStart?.({ id: event.response.id, model: event.response.model });
    }
    if (event.type === "response.output_text.delta" && event.delta.length > 0) {
      args.onDelta?.(event.delta);
    }
  }

  const response = await stream.finalResponse();
  const normalizedResponse = normalizeResponsesOutputText(response);
  return openAiCompatibleResponsesResponseSchema.parse(normalizedResponse);
}
