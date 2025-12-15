import "server-only";

import { z } from "zod/v4";
import type { OpenAiCompatibleFeatureConfig } from "@/types/ai-openai-compatible";

const DEFAULT_BASE_URL = "https://popos-sf7.com";
const DEFAULT_MODEL = "openai/gpt-oss-120b";
const DEFAULT_MAX_PARALLEL = 1;

function normalizeFeatureEnvKey(feature: string): string {
  return feature
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const baseUrlSchema = z.string().url();
const modelSchema = z.string().min(1);
const maxParallelSchema = z.number().int().min(1).max(20);

function readOptionalTrimmedEnv(key: string): string | undefined {
  const value = process.env[key];
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function resolveOpenAiCompatibleFeatureConfig(feature: string): OpenAiCompatibleFeatureConfig {
  const normalized = normalizeFeatureEnvKey(feature);

  const featureBaseUrl = readOptionalTrimmedEnv(`AI_${normalized}_OPENAI_BASE_URL`);
  const featureModel = readOptionalTrimmedEnv(`AI_${normalized}_LLM_MODEL`);
  const featureApiKey = readOptionalTrimmedEnv(`AI_${normalized}_OPENAI_API_KEY`);
  const featureMaxParallel = readOptionalTrimmedEnv(`AI_${normalized}_MAX_PARALLEL`);

  const defaultBaseUrl = readOptionalTrimmedEnv("AI_DEFAULT_OPENAI_BASE_URL");
  const defaultModel = readOptionalTrimmedEnv("AI_DEFAULT_LLM_MODEL");
  const defaultApiKey = readOptionalTrimmedEnv("AI_DEFAULT_OPENAI_API_KEY");
  const defaultMaxParallel = readOptionalTrimmedEnv("AI_DEFAULT_MAX_PARALLEL");

  const baseUrl = baseUrlSchema.parse(featureBaseUrl ?? defaultBaseUrl ?? DEFAULT_BASE_URL);
  const model = modelSchema.parse(featureModel ?? defaultModel ?? DEFAULT_MODEL);
  const apiKey = featureApiKey ?? defaultApiKey;
  const maxParallel = maxParallelSchema.parse(Number(featureMaxParallel ?? defaultMaxParallel ?? DEFAULT_MAX_PARALLEL));

  return apiKey ? { baseUrl, model, apiKey, maxParallel } : { baseUrl, model, maxParallel };
}

export function buildChatCompletionsUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.hash = "";
  url.search = "";

  const basePath = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");

  if (basePath.endsWith("/v1")) {
    url.pathname = `${basePath}/chat/completions`;
  } else {
    url.pathname = `${basePath}/v1/chat/completions`;
  }

  return url.toString();
}
