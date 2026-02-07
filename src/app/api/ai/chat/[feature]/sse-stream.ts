/**
 * SSE Stream Handler for AI Chat
 *
 * Handles Server-Sent Events streaming for the AI chat route.
 * Extracted for [FN1] Small and [FN2] Single Responsibility compliance.
 *
 * @module api/ai/chat/sse-stream
 */

import "server-only";

import { NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/utils/api-utils";

import type { SseStreamConfig } from "@/types/features/ai-chat";
import { logSuccessfulChat, logFailedChat } from "./chat-helpers";
import { isAbortError, resolveErrorResponse } from "./upstream-error";

/** Format an SSE event as a string ready for `TextEncoder.encode`. */
export function formatSseEvent(args: { event: string; data: unknown }): string {
  return `event: ${args.event}\ndata: ${JSON.stringify(args.data)}\n\n`;
}

/**
 * Create and return an SSE streaming response
 */
export function createSseStreamResponse(config: SseStreamConfig): NextResponse {
  const { request, queue, priority, startTime, logContext, ragContextStatus, runUpstream } = config;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let controllerClosed = false;

      const safeSend = (event: string, data: unknown) => {
        if (controllerClosed) return;
        try {
          controller.enqueue(encoder.encode(formatSseEvent({ event, data })));
        } catch (enqueueError) {
          // Stream closed by client - mark as closed and stop sending
          console.debug("[SSE] Stream enqueue failed (client disconnected):", enqueueError);
          controllerClosed = true;
        }
      };

      const safeClose = () => {
        if (controllerClosed) return;
        controllerClosed = true;
        try {
          controller.close();
        } catch (closeError) {
          // Stream already closed - safe to ignore but log for debugging
          console.debug("[SSE] Stream close failed (already closed):", closeError);
        }
      };

      const enqueuedAtMs = Date.now();
      const task = queue.enqueue({
        priority,
        signal: request.signal,
        run: () =>
          runUpstream((event) => {
            safeSend(event.event, event.data);
          }),
      });

      const initialPosition = queue.getPosition(task.id);
      safeSend("queued", initialPosition);

      const intervalMs = 350;
      const interval = setInterval(() => {
        const position = queue.getPosition(task.id);
        if (!position.inQueue) return;
        safeSend("queue", position);
      }, intervalMs);

      request.signal.addEventListener(
        "abort",
        () => {
          clearInterval(interval);
          safeClose();
        },
        { once: true },
      );

      let sseStartedAtMs: number | undefined;

      void task.started
        .then(() => {
          sseStartedAtMs = Date.now();
          clearInterval(interval);
          safeSend("started", {
            ...queue.snapshot,
            queueWaitMs: sseStartedAtMs - enqueuedAtMs,
          });
          return undefined;
        })
        .catch((startError: unknown) => {
          // Task failed to start - clean up interval; error will be handled by task.result
          console.debug("[SSE] Task start failed:", startError);
          clearInterval(interval);
        });

      void task.result
        .then((assistantMessage) => {
          const durationMs = Date.now() - startTime;
          const queueWaitMs = sseStartedAtMs ? sseStartedAtMs - enqueuedAtMs : 0;

          logSuccessfulChat(logContext, assistantMessage, durationMs, queueWaitMs);

          safeSend("done", {
            message: assistantMessage,
            ...(ragContextStatus !== "not_applicable" && { ragContext: ragContextStatus }),
          });
          safeClose();
          return undefined;
        })
        .catch((error: unknown) => {
          if (isAbortError(error)) {
            safeClose();
            return;
          }

          const durationMs = Date.now() - startTime;
          const queueWaitMs = sseStartedAtMs ? sseStartedAtMs - enqueuedAtMs : 0;
          const responseError = resolveErrorResponse(error);

          logFailedChat(
            logContext,
            responseError.message,
            durationMs,
            queueWaitMs,
            responseError.status,
          );

          safeSend("error", { error: responseError.message, status: responseError.status });
          safeClose();
        })
        .finally(() => {
          clearInterval(interval);
        });
    },
  });

  const headers: HeadersInit = {
    ...NO_STORE_HEADERS,
    "Cache-Control": "no-store, no-transform",
    "Content-Type": "text/event-stream; charset=utf-8",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };

  return new NextResponse(stream, { status: 200, headers });
}
