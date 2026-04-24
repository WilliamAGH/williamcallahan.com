import {
  endpointCompatibleEmbeddingsRequestSchema,
  endpointCompatibleEmbeddingsResponseSchema,
} from "@/types/schemas/ai-openai-compatible";
import { buildOpenAiApiBaseUrl } from "@/lib/ai/openai-compatible/feature-config";
import type {
  EndpointCompatibleEmbeddingConfig,
  OpenAiCompatibleTier,
} from "@/types/schemas/ai-openai-compatible";

const DEFAULT_TIMEOUT_MS = 30_000;

export async function embedTextsWithEndpointCompatibleModel(args: {
  config: EndpointCompatibleEmbeddingConfig;
  input: string[];
  tier: OpenAiCompatibleTier;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<number[][]> {
  const request = endpointCompatibleEmbeddingsRequestSchema.parse({
    model: args.config.model,
    input: args.input,
  });

  const apiBaseUrl = buildOpenAiApiBaseUrl(args.config.baseUrl);
  const apiKey = args.config.apiKey.trim();
  if (!apiKey) {
    throw new Error("Endpoint-compatible embedding API key is required.");
  }

  const timeoutMs =
    typeof args.timeoutMs === "number" && Number.isFinite(args.timeoutMs)
      ? args.timeoutMs
      : DEFAULT_TIMEOUT_MS;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const requestSignal = args.signal ? AbortSignal.any([args.signal, timeoutSignal]) : timeoutSignal;

  const response = await fetch(`${apiBaseUrl}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Tier": args.tier,
    },
    body: JSON.stringify(request),
    signal: requestSignal,
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(
      `[endpoint-compatible-embeddings] HTTP ${response.status} while embedding: ${responseBody}`,
    );
  }

  const parsedResponse = endpointCompatibleEmbeddingsResponseSchema.parse(await response.json());

  return [...parsedResponse.data]
    .toSorted((left, right) => left.index - right.index)
    .map((item) => item.embedding);
}
