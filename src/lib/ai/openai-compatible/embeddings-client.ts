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
const RECOMMENDED_INPUT_TOKENS = 8_192;
const APPROXIMATE_CHARS_PER_TOKEN = 4;
const INPUT_CHUNK_CHAR_LIMIT = RECOMMENDED_INPUT_TOKENS * APPROXIMATE_CHARS_PER_TOKEN;

function findChunkEnd(text: string, start: number, hardEnd: number): number {
  if (hardEnd >= text.length) return hardEnd;
  for (let index = hardEnd; index > start; index -= 1) {
    const char = text[index - 1];
    if (char && /\s/.test(char)) return index;
  }
  return hardEnd;
}

function splitEmbeddingInput(text: string): string[] {
  if (text.length <= INPUT_CHUNK_CHAR_LIMIT) return [text];

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const hardEnd = Math.min(start + INPUT_CHUNK_CHAR_LIMIT, text.length);
    const end = findChunkEnd(text, start, hardEnd);
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) chunks.push(chunk);
    start = end;
    while (start < text.length && /\s/.test(text.charAt(start))) start += 1;
  }
  return chunks;
}

function buildEmbeddingInputPlan(input: string[]): {
  input: string[];
  ranges: Array<[number, number]>;
} {
  const plannedInput: string[] = [];
  const ranges: Array<[number, number]> = [];

  for (const text of input) {
    const start = plannedInput.length;
    plannedInput.push(...splitEmbeddingInput(text));
    ranges.push([start, plannedInput.length]);
  }

  return { input: plannedInput, ranges };
}

function orderResponseEmbeddings(
  data: Array<{ index: number; embedding: number[] }>,
  expectedCount: number,
): number[][] {
  const ordered: number[][] = [];
  for (const item of data) {
    if (item.index >= expectedCount || ordered[item.index]) {
      throw new Error(`Invalid embedding response index: ${item.index}.`);
    }
    ordered[item.index] = item.embedding;
  }
  const complete: number[][] = [];
  for (let index = 0; index < expectedCount; index += 1) {
    const embedding = ordered[index];
    if (!embedding) {
      throw new Error(
        `Embedding count mismatch. Expected ${expectedCount}, received ${data.length}.`,
      );
    }
    complete.push(embedding);
  }
  return complete;
}

function poolChunkEmbeddings(embeddings: number[][]): number[] {
  const first = embeddings[0];
  if (!first) throw new Error("Cannot pool empty embedding chunks.");
  if (embeddings.length === 1) return first;

  const summed = Array.from({ length: first.length }, () => 0);
  for (const embedding of embeddings) {
    if (embedding.length !== first.length) {
      throw new Error("Cannot pool embedding chunks with different dimensions.");
    }
    for (let index = 0; index < embedding.length; index += 1) {
      const value = embedding[index];
      if (value === undefined || !Number.isFinite(value)) {
        throw new TypeError(`Embedding contains non-finite value at index ${index}.`);
      }
      const current = summed[index];
      if (current === undefined) {
        throw new Error(`Missing embedding accumulator at index ${index}.`);
      }
      summed[index] = current + value;
    }
  }

  let norm = 0;
  const averaged = summed.map((value) => {
    const average = value / embeddings.length;
    norm += average * average;
    return average;
  });
  const magnitude = Math.sqrt(norm);
  return magnitude > 0 ? averaged.map((value) => value / magnitude) : averaged;
}

export async function embedTextsWithEndpointCompatibleModel(args: {
  config: EndpointCompatibleEmbeddingConfig;
  input: string[];
  dimensions?: number;
  tier: OpenAiCompatibleTier;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<number[][]> {
  const parsedRequest = endpointCompatibleEmbeddingsRequestSchema.parse({
    model: args.config.model,
    input: args.input,
    dimensions: args.dimensions,
  });
  const plan = buildEmbeddingInputPlan(parsedRequest.input);
  const request = { ...parsedRequest, input: plan.input };

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
  const embeddings = orderResponseEmbeddings(parsedResponse.data, plan.input.length);

  return plan.ranges.map(([start, end]) => poolChunkEmbeddings(embeddings.slice(start, end)));
}
