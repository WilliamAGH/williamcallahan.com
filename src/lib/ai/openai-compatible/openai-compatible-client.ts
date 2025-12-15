import "server-only";

import {
  type OpenAiCompatibleChatCompletionsRequest,
  type OpenAiCompatibleChatCompletionsResponse,
  openAiCompatibleChatCompletionsRequestSchema,
  openAiCompatibleChatCompletionsResponseSchema,
} from "@/types/schemas/ai-openai-compatible";
import { fetchWithTimeout } from "@/lib/utils/http-client";
import { computeExponentialDelay } from "@/lib/utils/retry";
import logger from "@/lib/utils/logger";

const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_MAX_TOKENS = 1000;

/** Max retry attempts for transient errors */
const MAX_RETRIES = 3;
/** Base delay for exponential backoff (ms) */
const RETRY_BASE_DELAY_MS = 1000;
/** Maximum backoff delay (ms) */
const RETRY_MAX_DELAY_MS = 10_000;
/** Jitter factor for retry delays (0.2 = ±20%) */
const RETRY_JITTER = 0.2;

/**
 * Determine if an error is retryable (transient) vs permanent.
 *
 * For AI/LLM calls, we're more liberal with retries because:
 * 1. Network/gateway errors are transient
 * 2. JSON parse errors could be truncated responses
 * 3. Schema validation errors could be LLM non-determinism (might work next time)
 *
 * We still don't retry: user aborts, auth errors (401/403), bad requests (400)
 */
function isRetryableUpstreamError(error: unknown, httpStatus?: number): boolean {
  // Never retry if request was aborted by user
  if (error instanceof DOMException && error.name === "AbortError") {
    return false;
  }

  // Retry on specific HTTP status codes
  if (httpStatus !== undefined) {
    // 429 = rate limit, 502/503/504 = gateway errors, 408 = timeout, 500 = server error
    if ([408, 429, 500, 502, 503, 504].includes(httpStatus)) {
      return true;
    }
    // Don't retry other 4xx (bad request, auth, etc.)
    if (httpStatus >= 400 && httpStatus < 500) {
      return false;
    }
  }

  // Retry on JSON parse errors (SyntaxError) - could be truncated response
  if (error instanceof SyntaxError) {
    return true;
  }

  if (error instanceof Error) {
    // Retry on Zod validation errors - LLMs are non-deterministic,
    // a malformed response structure might succeed on retry
    if (error.name === "ZodError") {
      return true;
    }

    // Retry on network errors
    const msg = error.message.toLowerCase();
    if (
      msg.includes("econnreset") ||
      msg.includes("econnrefused") ||
      msg.includes("etimedout") ||
      msg.includes("fetch failed") ||
      msg.includes("network") ||
      msg.includes("timeout")
    ) {
      return true;
    }
  }

  return false;
}

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
    max_tokens: args.request.max_tokens ?? DEFAULT_MAX_TOKENS,
  });

  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (args.apiKey) {
    headers.Authorization = `Bearer ${args.apiKey}`;
  }

  let lastError: Error | null = null;
  let attempt = 0;

  while (attempt <= MAX_RETRIES) {
    // Check abort before each attempt
    if (args.signal?.aborted) {
      throw new DOMException("Request aborted", "AbortError");
    }

    try {
      const response = await fetchWithTimeout(args.url, {
        method: "POST",
        headers,
        timeout: args.timeoutMs ?? 60_000,
        body: JSON.stringify(validatedRequest),
        signal: args.signal,
      });

      const text = await response.text();

      if (!response.ok) {
        const error = new Error(
          `Upstream chat completion failed: HTTP ${response.status} ${response.statusText} - ${text}`,
        );

        if (isRetryableUpstreamError(error, response.status) && attempt < MAX_RETRIES) {
          lastError = error;
          attempt++;
          const delay = computeExponentialDelay(attempt, RETRY_BASE_DELAY_MS, RETRY_MAX_DELAY_MS, RETRY_JITTER);
          logger.warn(`[AI] Retrying upstream request (attempt ${attempt}/${MAX_RETRIES}) after ${delay}ms`, {
            status: response.status,
            error: error.message.slice(0, 200),
          });
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        throw error;
      }

      // Parse and validate response
      const json: unknown = text ? JSON.parse(text) : {};
      return openAiCompatibleChatCompletionsResponseSchema.parse(json);
    } catch (error) {
      // Don't retry abort errors - user explicitly cancelled
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }

      // Check if retryable (includes ZodError for LLM non-determinism)
      if (isRetryableUpstreamError(error, undefined) && attempt < MAX_RETRIES) {
        lastError = error instanceof Error ? error : new Error(String(error));
        attempt++;
        const delay = computeExponentialDelay(attempt, RETRY_BASE_DELAY_MS, RETRY_MAX_DELAY_MS, RETRY_JITTER);
        logger.warn(`[AI] Retrying upstream request (attempt ${attempt}/${MAX_RETRIES}) after ${delay}ms`, {
          error: lastError.message.slice(0, 200),
        });
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }

  // Should not reach here, but if we do, throw last error
  throw lastError ?? new Error("Upstream request failed after retries");
}
