/**
 * SSE Stream Handler for AI Chat
 *
 * Handles Server-Sent Events streaming for the AI chat route.
 * Extracted for [FN1] Small and [FN2] Single Responsibility compliance.
 *
 * @module api/ai/chat/sse-stream
 */

import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/utils/api-utils";
import { UpstreamRequestQueue } from "@/lib/ai/openai-compatible/upstream-request-queue";
import {
  formatSseEvent,
  logSuccessfulChat,
  logFailedChat,
  formatErrorMessage,
  type ChatLogContext,
  type RagContextStatus,
} from "./chat-helpers";

/** SSE stream configuration */
export type SseStreamConfig = {
  request: NextRequest;
  queue: UpstreamRequestQueue;
  upstreamKey: string;
  priority: number;
  startTime: number;
  logContext: ChatLogContext;
  ragContextStatus: RagContextStatus;
  runUpstream: () => Promise<string>;
};

/**
 * Create and return an SSE streaming response
 */
export function createSseStreamResponse(config: SseStreamConfig): NextResponse {
  const {
    request,
    queue,
    upstreamKey,
    priority,
    startTime,
    logContext,
    ragContextStatus,
    runUpstream,
  } = config;
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
        run: runUpstream,
      });

      const initialPosition = queue.getPosition(task.id);
      safeSend("queued", { ...initialPosition, upstreamKey });

      const intervalMs = 350;
      const interval = setInterval(() => {
        const position = queue.getPosition(task.id);
        if (!position.inQueue) return;
        safeSend("queue", { ...position, upstreamKey });
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
            upstreamKey,
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
          const durationMs = Date.now() - startTime;
          const queueWaitMs = sseStartedAtMs ? sseStartedAtMs - enqueuedAtMs : 0;
          const errorMessage = error instanceof Error ? error.message : String(error);

          logFailedChat(logContext, errorMessage, durationMs, queueWaitMs);

          safeSend("error", { error: formatErrorMessage(error) });
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
