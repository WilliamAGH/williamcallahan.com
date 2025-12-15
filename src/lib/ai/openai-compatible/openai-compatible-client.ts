import "server-only";

import {
  type OpenAiCompatibleChatCompletionsRequest,
  type OpenAiCompatibleChatCompletionsResponse,
  openAiCompatibleChatCompletionsRequestSchema,
  openAiCompatibleChatCompletionsResponseSchema,
} from "@/types/schemas/ai-openai-compatible";
import { fetchWithTimeout } from "@/lib/utils/http-client";

const DEFAULT_TEMPERATURE = 0.3;

export async function callOpenAiCompatibleChatCompletions(args: {
  url: string;
  apiKey?: string;
  request: OpenAiCompatibleChatCompletionsRequest;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<OpenAiCompatibleChatCompletionsResponse> {
  const validatedRequest = openAiCompatibleChatCompletionsRequestSchema.parse({
    ...args.request,
    temperature: args.request.temperature ?? DEFAULT_TEMPERATURE,
  });

  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (args.apiKey) {
    headers.Authorization = `Bearer ${args.apiKey}`;
  }

  const response = await fetchWithTimeout(args.url, {
    method: "POST",
    headers,
    timeout: args.timeoutMs ?? 60_000,
    body: JSON.stringify(validatedRequest),
    signal: args.signal,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Upstream chat completion failed: HTTP ${response.status} ${response.statusText} - ${text}`);
  }

  const json: unknown = text ? JSON.parse(text) : {};
  return openAiCompatibleChatCompletionsResponseSchema.parse(json);
}
