import { createHash } from "node:crypto";
import OpenAIClient from "openai";
import {
  endpointCompatibleEmbeddingsRequestSchema,
  endpointCompatibleEmbeddingsResponseSchema,
} from "@/types/schemas/ai-openai-compatible";
import {
  buildOpenAiApiBaseUrl,
  type EndpointCompatibleEmbeddingConfig,
} from "@/lib/ai/openai-compatible/feature-config";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 1;

const clientByConfig = new Map<string, OpenAIClient>();

function buildClientCacheKey(apiBaseUrl: string, apiKey: string): string {
  const keyHash = createHash("sha256").update(apiKey).digest("hex");
  return `${apiBaseUrl}::${keyHash}`;
}

function resolveEmbeddingClient(
  config: EndpointCompatibleEmbeddingConfig,
  timeoutMs?: number,
): OpenAIClient {
  const apiBaseUrl = buildOpenAiApiBaseUrl(config.baseUrl);
  const apiKey = config.apiKey.trim();
  if (!apiKey) {
    throw new Error("Endpoint-compatible embedding API key is required.");
  }

  const clientKey = buildClientCacheKey(apiBaseUrl, apiKey);
  const existingClient = clientByConfig.get(clientKey);
  if (existingClient) {
    return existingClient;
  }

  const timeout = Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS;
  const client = new OpenAIClient({
    apiKey,
    baseURL: apiBaseUrl,
    timeout,
    maxRetries: DEFAULT_MAX_RETRIES,
  });

  clientByConfig.set(clientKey, client);
  return client;
}

export async function embedTextsWithEndpointCompatibleModel(args: {
  config: EndpointCompatibleEmbeddingConfig;
  input: string[];
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<number[][]> {
  const request = endpointCompatibleEmbeddingsRequestSchema.parse({
    model: args.config.model,
    input: args.input,
  });

  const client = resolveEmbeddingClient(args.config, args.timeoutMs);
  const response = await client.embeddings.create(request, { signal: args.signal });
  const parsedResponse = endpointCompatibleEmbeddingsResponseSchema.parse(response);

  return [...parsedResponse.data]
    .toSorted((left, right) => left.index - right.index)
    .map((item) => item.embedding);
}
