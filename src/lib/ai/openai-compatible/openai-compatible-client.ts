/**
 * OpenAI-Compatible API Client
 *
 * Server-side adapter for calling OpenAI-compatible upstream services via both
 * the Chat Completions and Responses APIs. Handles client caching, request
 * validation (Zod), native reasoning-delta forwarding, and response normalization.
 */

import "server-only";

import { createHash } from "node:crypto";
import OpenAIClient from "openai";
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
} from "openai/resources/chat/completions";
import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import {
  type OpenAiCompatibleChatCompletionsRequest,
  type OpenAiCompatibleChatCompletionsResponse,
  type OpenAiCompatibleResponsesRequest,
  type OpenAiCompatibleResponsesResponse,
  type OpenAiCompatibleTier,
  openAiCompatibleChatCompletionsRequestSchema,
  openAiCompatibleChatCompletionsResponseSchema,
  openAiCompatibleResponsesRequestSchema,
  openAiCompatibleResponsesResponseSchema,
  responsesOutputMessageItemSchema,
} from "@/types/schemas/ai-openai-compatible";
import { buildOpenAiApiBaseUrl } from "@/lib/ai/openai-compatible/feature-config";
import {
  toChatRequest,
  toRequestOptions,
  toResponsesInput,
} from "./openai-compatible-message-mapper";

const DEFAULT_REQUEST_OPTIONS = { timeoutMs: 30_000, maxRetries: 1 } as const;
const INTERACTIVE_STREAM_REQUEST_OPTIONS = { timeoutMs: 180_000, maxRetries: 0 } as const;

const clientByConfig = new Map<string, OpenAIClient>();

function buildClientCacheKey(apiBaseUrl: string, apiKey: string): string {
  const keyHash = createHash("sha256").update(apiKey).digest("hex");
  return `${apiBaseUrl}::${keyHash}`;
}

function resolveClient(args: { baseUrl: string; apiKey?: string }): OpenAIClient {
  const apiBaseUrl = buildOpenAiApiBaseUrl(args.baseUrl);
  const apiKey = args.apiKey?.trim();
  if (!apiKey) {
    throw new Error(
      `[AI] No upstream API key configured for ${args.baseUrl}. Set the corresponding AI_*_OPENAI_API_KEY environment variable.`,
    );
  }
  const clientKey = buildClientCacheKey(apiBaseUrl, apiKey);
  const existingClient = clientByConfig.get(clientKey);
  if (existingClient) return existingClient;

  const client = new OpenAIClient({
    apiKey,
    baseURL: apiBaseUrl,
  });

  clientByConfig.set(clientKey, client);
  return client;
}

function resolveRequestOptions(
  args: Parameters<typeof toRequestOptions>[0] & { baseUrl: string },
  defaults: { timeoutMs: number; maxRetries: number },
): OpenAIClient.RequestOptions {
  let timeoutMs = args.timeoutMs;
  if (timeoutMs === undefined) {
    timeoutMs = defaults.timeoutMs;
  } else if (!Number.isFinite(timeoutMs)) {
    console.warn("[AI] Invalid timeout (NaN/Infinity); defaulting to request timeout.", {
      baseUrl: args.baseUrl,
      provided: timeoutMs,
      timeoutMs: defaults.timeoutMs,
    });
    timeoutMs = defaults.timeoutMs;
  }
  return { ...toRequestOptions({ ...args, timeoutMs }), maxRetries: defaults.maxRetries };
}

function validateChatRequest(request: OpenAiCompatibleChatCompletionsRequest) {
  return openAiCompatibleChatCompletionsRequestSchema.parse(request);
}

/**
 * Gateway inputs are validated against the canonical schema before this boundary.
 * The SDK's generated reasoning union is narrower than the gateway wire contract,
 * while its transport forwards the request body unchanged.
 */
function toSdkChatCompletionsRequest(
  request: ReturnType<typeof toChatRequest>,
): ChatCompletionCreateParamsNonStreaming {
  return request as ChatCompletionCreateParamsNonStreaming;
}

function validateResponsesRequest(
  request: OpenAiCompatibleResponsesRequest,
): OpenAiCompatibleResponsesRequest {
  const parsedRequest = openAiCompatibleResponsesRequestSchema.parse(request);
  const normalizedTools: OpenAiCompatibleResponsesRequest["tools"] = parsedRequest.tools?.map(
    (tool) => ({
      ...tool,
      parameters: tool.parameters ?? null,
      strict: tool.strict ?? null,
    }),
  );

  return {
    ...parsedRequest,
    tools: normalizedTools,
  };
}

/** See toSdkChatCompletionsRequest for the validated gateway-to-SDK type boundary. */
function toSdkResponsesRequest(
  request: OpenAiCompatibleResponsesRequest,
): ResponseCreateParamsNonStreaming {
  return {
    ...request,
    input: toResponsesInput(request.input),
  } as ResponseCreateParamsNonStreaming;
}

function deriveOutputTextFromResponsesOutput(output: unknown[]): string {
  const textChunks: string[] = [];
  const refusalChunks: string[] = [];
  for (const item of output) {
    const parsed = responsesOutputMessageItemSchema.safeParse(item);
    if (!parsed.success) continue;
    for (const content of parsed.data.content) {
      if (content.type === "output_text") {
        textChunks.push(content.text);
      } else {
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

export function assertOpenAiCompatibleResponsesSucceeded(
  response: OpenAiCompatibleResponsesResponse,
): void {
  if (response.status === undefined || response.status === "completed") return;
  const detail = response.error
    ? `${response.error.code}: ${response.error.message}`
    : `No provider error details returned for status "${response.status}".`;
  throw Object.assign(
    new Error(
      `[AI] Responses API returned status "${response.status}" for ${response.id}: ${detail}`,
    ),
    { name: "OpenAiCompatibleResponsesFailureError", status: 502 },
  );
}

export async function callOpenAiCompatibleChatCompletions(args: {
  baseUrl: string;
  apiKey?: string;
  request: OpenAiCompatibleChatCompletionsRequest;
  tier: OpenAiCompatibleTier;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<OpenAiCompatibleChatCompletionsResponse> {
  const validatedRequest = validateChatRequest(args.request);
  const client = resolveClient(args);
  const completion: ChatCompletion = await client.chat.completions.create(
    toSdkChatCompletionsRequest(toChatRequest(validatedRequest)),
    resolveRequestOptions(args, DEFAULT_REQUEST_OPTIONS),
  );
  return openAiCompatibleChatCompletionsResponseSchema.parse(completion);
}

export async function streamOpenAiCompatibleChatCompletions(args: {
  baseUrl: string;
  apiKey?: string;
  request: OpenAiCompatibleChatCompletionsRequest;
  tier: OpenAiCompatibleTier;
  timeoutMs?: number;
  signal?: AbortSignal;
  onStart?: (meta: { id: string; model: string }) => void;
  onDelta?: (delta: string) => void;
  onThinkingDelta?: (delta: string) => void;
}): Promise<OpenAiCompatibleChatCompletionsResponse> {
  const validatedRequest = validateChatRequest(args.request);
  const client = resolveClient(args);
  const stream = client.chat.completions.stream(
    { ...toSdkChatCompletionsRequest(toChatRequest(validatedRequest)), stream: true },
    resolveRequestOptions(args, INTERACTIVE_STREAM_REQUEST_OPTIONS),
  );

  let startEmitted = false;
  for await (const chunk of stream) {
    if (!startEmitted) {
      startEmitted = true;
      args.onStart?.({ id: chunk.id, model: chunk.model });
    }

    const delta = chunk.choices[0]?.delta?.content;
    if (typeof delta === "string" && delta.length > 0) {
      args.onDelta?.(delta);
    }

    // Reasoning fields are untyped in the SDK but present at runtime:
    // - "reasoning_content": DeepSeek API / llama.cpp --reasoning-format deepseek
    // - "reasoning": llama.cpp --reasoning-format auto (default for gpt-oss models)
    const choiceDelta = chunk.choices[0]?.delta;
    let thinkingDelta: unknown;
    if (choiceDelta && "reasoning_content" in choiceDelta) {
      thinkingDelta = choiceDelta.reasoning_content;
    } else if (choiceDelta && "reasoning" in choiceDelta) {
      thinkingDelta = choiceDelta.reasoning;
    }
    if (typeof thinkingDelta === "string" && thinkingDelta.length > 0) {
      args.onThinkingDelta?.(thinkingDelta);
    }
  }

  if (!startEmitted) {
    throw new Error(
      `[AI] Chat completions stream completed without emitting any chunks (model: ${args.request.model})`,
    );
  }

  const completion = await stream.finalChatCompletion();
  return openAiCompatibleChatCompletionsResponseSchema.parse(completion);
}

export async function callOpenAiCompatibleResponses(args: {
  baseUrl: string;
  apiKey?: string;
  request: OpenAiCompatibleResponsesRequest;
  tier: OpenAiCompatibleTier;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<OpenAiCompatibleResponsesResponse> {
  const validatedRequest = validateResponsesRequest(args.request);
  const client = resolveClient(args);
  const response = await client.responses.create(
    toSdkResponsesRequest(validatedRequest),
    resolveRequestOptions(args, DEFAULT_REQUEST_OPTIONS),
  );
  const normalizedResponse = normalizeResponsesOutputText(response);
  const parsedResponse = openAiCompatibleResponsesResponseSchema.parse(normalizedResponse);
  assertOpenAiCompatibleResponsesSucceeded(parsedResponse);
  return parsedResponse;
}

export async function streamOpenAiCompatibleResponses(args: {
  baseUrl: string;
  apiKey?: string;
  request: OpenAiCompatibleResponsesRequest;
  tier: OpenAiCompatibleTier;
  timeoutMs?: number;
  signal?: AbortSignal;
  onStart?: (meta: { id: string; model: string }) => void;
  onDelta?: (delta: string) => void;
  onThinkingDelta?: (delta: string) => void;
}): Promise<OpenAiCompatibleResponsesResponse> {
  const validatedRequest = validateResponsesRequest(args.request);
  const client = resolveClient(args);
  const stream = client.responses.stream(
    {
      ...toSdkResponsesRequest(validatedRequest),
      stream: true,
    },
    resolveRequestOptions(args, INTERACTIVE_STREAM_REQUEST_OPTIONS),
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

    // Reasoning summary events from OpenAI models that support extended thinking
    if (event.type === "response.reasoning_summary_text.delta" && "delta" in event) {
      const reasoningDelta = event.delta;
      if (typeof reasoningDelta === "string" && reasoningDelta.length > 0) {
        args.onThinkingDelta?.(reasoningDelta);
      }
    }
  }

  if (!startEmitted) {
    const modelLabel =
      typeof validatedRequest.model === "string" && validatedRequest.model.length > 0
        ? validatedRequest.model
        : "<unset>";
    throw new Error(
      `[AI] Responses stream completed without emitting any events (model: ${modelLabel})`,
    );
  }

  const response = await stream.finalResponse();
  const normalizedResponse = normalizeResponsesOutputText(response);
  const parsedResponse = openAiCompatibleResponsesResponseSchema.parse(normalizedResponse);
  assertOpenAiCompatibleResponsesSucceeded(parsedResponse);
  return parsedResponse;
}
