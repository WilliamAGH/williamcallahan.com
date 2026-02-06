/**
 * JSON Response Handler for AI Chat
 *
 * Handles non-SSE JSON responses for the AI chat route.
 * Extracted for [FN1] Small and [FN2] Single Responsibility compliance.
 *
 * @module api/ai/chat/json-response
 */

import "server-only";

import { NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/utils/api-utils";
import type { JsonResponseConfig } from "@/types/features/ai-chat";
import { logSuccessfulChat, logFailedChat, isAbortError } from "./chat-helpers";
import { resolveErrorResponse } from "./upstream-error";

/** Handle non-SSE JSON response */
export async function handleJsonResponse(config: JsonResponseConfig): Promise<NextResponse> {
  const { queue, priority, startTime, logContext, ragContextStatus, runUpstream, signal } = config;

  try {
    const enqueuedAtMs = Date.now();
    const task = queue.enqueue({ priority, signal, run: runUpstream });

    let startedAtMs: number | null = null;
    void task.started
      .then(() => {
        startedAtMs = Date.now();
        return undefined;
      })
      .catch(() => {
        // Rejection handled by await task.result
      });

    const assistantText = await task.result;

    const durationMs = Date.now() - startTime;
    const queueWaitMs = startedAtMs ? Math.max(0, startedAtMs - enqueuedAtMs) : 0;

    logSuccessfulChat(logContext, assistantText, durationMs, queueWaitMs);

    return NextResponse.json(
      {
        message: assistantText,
        ...(ragContextStatus !== "not_applicable" && { ragContext: ragContextStatus }),
      },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch (error: unknown) {
    if (isAbortError(error)) {
      return NextResponse.json(
        { error: "Request aborted" },
        { status: 499, headers: NO_STORE_HEADERS },
      );
    }

    const durationMs = Date.now() - startTime;
    const responseError = resolveErrorResponse(error);

    logFailedChat(logContext, responseError.message, durationMs, 0, responseError.status);

    return NextResponse.json(
      { error: responseError.message },
      { status: responseError.status, headers: NO_STORE_HEADERS },
    );
  }
}
