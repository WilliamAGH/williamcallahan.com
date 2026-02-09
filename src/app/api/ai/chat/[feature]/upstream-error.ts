/**
 * Upstream Error Mapping
 *
 * Maps OpenAI-compatible upstream errors to client-facing HTTP responses.
 * Auth failures and rate limits become 503 to avoid leaking upstream topology.
 *
 * @module api/ai/chat/upstream-error
 */

import "server-only";

import type { AiChatModelStreamEvent, StreamStartMeta } from "@/types/features/ai-chat";
import type { AiUpstreamApiMode } from "@/types/schemas/ai-openai-compatible";
import type { AiChatStreamErrorKind } from "@/types/schemas/ai-openai-compatible-client";

/** Upstream error message pattern for model-load failures (single source of truth). */
export const MODEL_LOAD_FAILURE_PATTERN = "Failed to load model";

/** Check whether an upstream error indicates the requested model could not be loaded. */
export function isModelLoadFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(MODEL_LOAD_FAILURE_PATTERN);
}

/** Check whether an error is a connection timeout from the upstream AI service. */
export function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "APIConnectionTimeoutError") return true;
  const msg = error.message.toLowerCase();
  return msg.includes("timed out") || msg.includes("timeout");
}

/** Check whether an error is an AbortError (request cancelled by client). */
export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

/** Format error message for response (sanitized in production) */
export function formatErrorMessage(error: unknown): string {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return process.env.NODE_ENV === "production"
    ? "Upstream AI service error"
    : `Upstream AI service error: ${errorMessage}`;
}

/** Map upstream error to client-facing status + message + semantic kind.
 *  Auth failures (401/403) and rate limits (429) become 503 to avoid
 *  leaking upstream topology to the browser. */
export function resolveErrorResponse(error: unknown): {
  status: number;
  message: string;
  kind: AiChatStreamErrorKind;
} {
  if (isTimeoutError(error)) {
    return {
      status: 504,
      kind: "timeout",
      message: "The AI service took too long to respond. Please try again.",
    };
  }

  const baseMessage = formatErrorMessage(error);
  if (!error || typeof error !== "object") {
    return { status: 502, kind: "upstream", message: `${baseMessage}. Please try again.` };
  }

  const maybeStatus = "status" in error ? error.status : undefined;
  const status = typeof maybeStatus === "number" ? maybeStatus : 502;
  const message = error instanceof Error ? error.message : baseMessage;

  if (status === 401 || status === 403) {
    return { status: 503, kind: "auth", message: "AI upstream authentication failed" };
  }
  if (status === 429) {
    return {
      status: 503,
      kind: "rate_limit",
      message: "AI upstream rate limit exceeded. Please try again shortly.",
    };
  }
  if (status === 400 && message.includes(MODEL_LOAD_FAILURE_PATTERN)) {
    return {
      status: 503,
      kind: "model_unavailable",
      message: "AI upstream model is currently unavailable",
    };
  }

  return { status: 502, kind: "upstream", message: `${baseMessage}. Please try again.` };
}

/** Emit start/delta events after a turn resolves with final content. */
export function emitDeferredContentEvents(params: {
  text: string;
  startMeta: StreamStartMeta | null;
  apiMode: AiUpstreamApiMode;
  onStreamEvent: (event: AiChatModelStreamEvent) => void;
  includeStartEvent?: boolean;
}): void {
  const { text, startMeta, apiMode, onStreamEvent, includeStartEvent = true } = params;
  if (startMeta && includeStartEvent) {
    onStreamEvent({
      event: "message_start",
      data: { id: startMeta.id, model: startMeta.model, apiMode },
    });
  }
  onStreamEvent({ event: "message_delta", data: { delta: text } });
}
