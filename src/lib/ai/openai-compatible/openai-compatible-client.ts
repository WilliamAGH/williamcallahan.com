import "server-only";

import { createHash } from "node:crypto";
import OpenAIClient from "openai";
import type { ChatCompletion } from "openai/resources/chat/completions";
import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import {
  type OpenAiCompatibleChatCompletionsRequest,
  type OpenAiCompatibleChatCompletionsResponse,
  type OpenAiCompatibleResponsesRequest,
  type OpenAiCompatibleResponsesResponse,
  openAiCompatibleChatCompletionsRequestSchema,
  openAiCompatibleChatCompletionsResponseSchema,
  openAiCompatibleResponsesRequestSchema,
  openAiCompatibleResponsesResponseSchema,
  responsesOutputRefusalItemSchema,
  responsesOutputTextItemSchema,
} from "@/types/schemas/ai-openai-compatible";
import { buildOpenAiApiBaseUrl } from "@/lib/ai/openai-compatible/feature-config";
import {
  toChatRequest,
  toRequestOptions,
  toResponsesInput,
} from "./openai-compatible-message-mapper";
import { createThinkTagParser, stripThinkTags } from "./think-tag-parser";

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 3;

const clientByConfig = new Map<string, OpenAIClient>();

function buildClientCacheKey(apiBaseUrl: string, apiKey: string): string {
  const keyHash = createHash("sha256").update(apiKey).digest("hex");
  return `${apiBaseUrl}::${keyHash}`;
}

function resolveClient(args: {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
}): OpenAIClient {
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

  let timeout = args.timeoutMs;
  if (!Number.isFinite(timeout)) {
    console.warn("[AI] No timeout configured; defaulting to client timeout.", {
      baseUrl: args.baseUrl,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    });
    timeout = DEFAULT_TIMEOUT_MS;
  }

  const client = new OpenAIClient({
    apiKey,
    baseURL: apiBaseUrl,
    timeout,
    maxRetries: DEFAULT_MAX_RETRIES,
  });

  clientByConfig.set(clientKey, client);
  return client;
}

function validateChatRequest(request: OpenAiCompatibleChatCompletionsRequest) {
  return openAiCompatibleChatCompletionsRequestSchema.parse(request);
}

function validateResponsesRequest(
  request: Omit<ResponseCreateParamsNonStreaming, "input"> & {
    input: OpenAiCompatibleResponsesRequest["input"];
  },
): Omit<ResponseCreateParamsNonStreaming, "input"> & {
  input: OpenAiCompatibleResponsesRequest["input"];
} {
  const parsedRequest = openAiCompatibleResponsesRequestSchema.parse(request);
  const normalizedTools: ResponseCreateParamsNonStreaming["tools"] = parsedRequest.tools?.map(
    (tool) => ({
      ...tool,
      parameters: tool.parameters ?? null,
      strict: tool.strict ?? null,
    }),
  );

  return {
    ...request,
    model: parsedRequest.model,
    input: parsedRequest.input,
    temperature: parsedRequest.temperature,
    top_p: parsedRequest.top_p,
    max_output_tokens: parsedRequest.max_output_tokens,
    tools: normalizedTools,
    tool_choice: request.tool_choice,
    parallel_tool_calls: parsedRequest.parallel_tool_calls,
    reasoning: parsedRequest.reasoning,
  };
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
  onThinkingDelta?: (delta: string) => void;
}): Promise<OpenAiCompatibleChatCompletionsResponse> {
  const validatedRequest = validateChatRequest(args.request);
  const client = resolveClient(args);
  const stream = client.chat.completions.stream(
    { ...toChatRequest(validatedRequest), stream: true },
    toRequestOptions(args),
  );

  const thinkParser = args.onThinkingDelta
    ? createThinkTagParser({
        onContent: (text) => args.onDelta?.(text),
        onThinking: (text) => args.onThinkingDelta?.(text),
      })
    : null;

  let startEmitted = false;
  for await (const chunk of stream) {
    if (!startEmitted) {
      startEmitted = true;
      args.onStart?.({ id: chunk.id, model: chunk.model });
    }

    const delta = chunk.choices[0]?.delta?.content;
    if (typeof delta === "string" && delta.length > 0) {
      if (thinkParser) {
        thinkParser.push(delta);
      } else {
        args.onDelta?.(delta);
      }
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

  thinkParser?.end();

  if (!startEmitted) {
    throw new Error(
      `[AI] Chat completions stream completed without emitting any chunks (model: ${args.request.model})`,
    );
  }

  const completion = await stream.finalChatCompletion();
  // Strip <think> tags from the assembled completion so downstream consumers
  // (e.g. JSON analysis parsers) see only the visible response content.
  if (thinkParser && completion.choices[0]?.message?.content) {
    completion.choices[0].message.content = stripThinkTags(completion.choices[0].message.content);
  }
  return openAiCompatibleChatCompletionsResponseSchema.parse(completion);
}

export async function callOpenAiCompatibleResponses(args: {
  baseUrl: string;
  apiKey?: string;
  request: Omit<ResponseCreateParamsNonStreaming, "input"> & {
    input: OpenAiCompatibleResponsesRequest["input"];
  };
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<OpenAiCompatibleResponsesResponse> {
  const validatedRequest = validateResponsesRequest(args.request);
  const client = resolveClient(args);
  const response = await client.responses.create(
    {
      ...validatedRequest,
      input: toResponsesInput(validatedRequest.input),
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
    input: OpenAiCompatibleResponsesRequest["input"];
  };
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
      ...validatedRequest,
      input: toResponsesInput(validatedRequest.input),
      stream: true,
    },
    toRequestOptions(args),
  );

  const thinkParser = args.onThinkingDelta
    ? createThinkTagParser({
        onContent: (text) => args.onDelta?.(text),
        onThinking: (text) => args.onThinkingDelta?.(text),
      })
    : null;

  let startEmitted = false;
  for await (const event of stream) {
    if (!startEmitted && "response" in event && event.response?.id && event.response.model) {
      startEmitted = true;
      args.onStart?.({ id: event.response.id, model: event.response.model });
    }
    if (event.type === "response.output_text.delta" && event.delta.length > 0) {
      if (thinkParser) {
        thinkParser.push(event.delta);
      } else {
        args.onDelta?.(event.delta);
      }
    }

    // Reasoning summary events from OpenAI models that support extended thinking
    if (event.type === "response.reasoning_summary_text.delta" && "delta" in event) {
      const reasoningDelta = event.delta;
      if (typeof reasoningDelta === "string" && reasoningDelta.length > 0) {
        args.onThinkingDelta?.(reasoningDelta);
      }
    }
  }

  thinkParser?.end();

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
  if (thinkParser && normalizedResponse.output_text) {
    normalizedResponse.output_text = stripThinkTags(normalizedResponse.output_text);
  }
  return openAiCompatibleResponsesResponseSchema.parse(normalizedResponse);
}
