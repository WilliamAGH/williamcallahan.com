/**
 * Upstream Error Mapping
 *
 * Maps OpenAI-compatible upstream errors to client-facing HTTP responses.
 * Auth failures and rate limits become 503 to avoid leaking upstream topology.
 *
 * @module api/ai/chat/upstream-error
 */

import "server-only";

/** Upstream error message pattern for model-load failures (single source of truth). */
export const MODEL_LOAD_FAILURE_PATTERN = "Failed to load model";

/** Check whether an upstream error indicates the requested model could not be loaded. */
export function isModelLoadFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(MODEL_LOAD_FAILURE_PATTERN);
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

/** Map upstream error to client-facing status + message.
 *  Auth failures (401/403) and rate limits (429) become 503 to avoid
 *  leaking upstream topology to the browser. */
export function resolveErrorResponse(error: unknown): { status: number; message: string } {
  const baseMessage = formatErrorMessage(error);
  if (!error || typeof error !== "object") {
    return { status: 502, message: baseMessage };
  }

  const maybeStatus = (error as { status?: unknown }).status;
  const status = typeof maybeStatus === "number" ? maybeStatus : 502;
  const message = error instanceof Error ? error.message : baseMessage;

  if (status === 401 || status === 403) {
    return { status: 503, message: "AI upstream authentication failed" };
  }
  if (status === 429) {
    return { status: 503, message: "AI upstream rate limit exceeded" };
  }
  if (status === 400 && message.includes(MODEL_LOAD_FAILURE_PATTERN)) {
    return { status: 503, message: "AI upstream model is currently unavailable" };
  }

  return { status: 502, message: baseMessage };
}
