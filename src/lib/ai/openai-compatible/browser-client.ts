import type {
  AiBrowserTokenCache,
  AiChatClientOptions,
  AiChatRequest,
} from "@/types/ai-openai-compatible-client";
import {
  aiChatModelStreamDeltaSchema,
  aiChatModelStreamDoneSchema,
  aiChatModelStreamStartSchema,
  aiChatQueuePositionSchema,
  aiChatResponseSchema,
  aiChatStreamErrorSchema,
  aiChatThinkingDeltaSchema,
  aiChatThinkingDoneSchema,
  aiTokenResponseSchema,
} from "@/types/schemas/ai-openai-compatible-client";

let cachedToken: AiBrowserTokenCache | null = null;

function tokenIsValid(token: AiBrowserTokenCache): boolean {
  return token.expiresAtMs - Date.now() > 5_000;
}

function parseSseMessage(raw: string): { event: string; data: string } | null {
  const lines = raw.split("\n");
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  const data = dataLines.join("\n").trim();
  if (!data) return null;
  return { event, data };
}

function normalizeSseLineEndings(value: string): string {
  return value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

/**
 * Safely parse JSON from SSE data, providing a clear error message on failure.
 * @param data - The raw SSE data string to parse
 * @param eventType - The SSE event type for error context
 * @throws Error with context if parsing fails
 */
function safeParseJson(data: string, eventType: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    throw new Error(`Malformed JSON in SSE '${eventType}' event`);
  }
}

async function assertSseContentType(response: Response): Promise<void> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("text/event-stream")) return;

  const responseText = await response.text();
  const bodyPreview = responseText.trim();
  const preview = bodyPreview.length > 240 ? `${bodyPreview.slice(0, 240)}...` : bodyPreview;
  const headerValue = contentType || "missing";
  throw new Error(
    `AI chat expected text/event-stream but received '${headerValue}' (status ${response.status}). ${preview}`,
  );
}

async function readSseStream(args: {
  response: Response;
  signal?: AbortSignal;
  onQueueUpdate?: AiChatClientOptions["onQueueUpdate"];
  onStreamEvent?: AiChatClientOptions["onStreamEvent"];
}): Promise<string> {
  const { response, signal, onQueueUpdate, onStreamEvent } = args;
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("AI chat stream is not readable");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let didReceiveMessageDone = false;
  let finalMessage: string | null = null;
  let streamedMessageFromDeltas = "";

  const processMessage = (msg: { event: string; data: string }): string | undefined => {
    if (msg.event === "done") {
      if (msg.data.trim() === "[DONE]") {
        const fallbackMessage =
          finalMessage ?? (streamedMessageFromDeltas.length > 0 ? streamedMessageFromDeltas : null);
        if (fallbackMessage === null) return undefined;
        if (!didReceiveMessageDone) {
          onStreamEvent?.({
            event: "message_done",
            data: aiChatModelStreamDoneSchema.parse({ message: fallbackMessage }),
          });
        }
        didReceiveMessageDone = true;
        finalMessage = fallbackMessage;
        return fallbackMessage;
      }

      const parsed = safeParseJson(msg.data, "done");
      const doneMessage = aiChatResponseSchema.parse(parsed).message;
      if (!didReceiveMessageDone) {
        onStreamEvent?.({
          event: "message_done",
          data: aiChatModelStreamDoneSchema.parse({ message: doneMessage }),
        });
      }
      didReceiveMessageDone = true;
      finalMessage = doneMessage;
      return doneMessage;
    }

    if (msg.event === "error") {
      const parsed = safeParseJson(msg.data, "error");
      const errorObj = aiChatStreamErrorSchema.parse(parsed);
      const streamError = new Error(errorObj.error);
      if (errorObj.kind) {
        (streamError as Error & { kind: string }).kind = errorObj.kind;
      }
      throw streamError;
    }

    if (msg.event === "queued" || msg.event === "queue") {
      const parsed = safeParseJson(msg.data, msg.event);
      const position = aiChatQueuePositionSchema.parse(parsed);
      onQueueUpdate?.({
        event: msg.event,
        position: position.position ?? null,
        running: position.running,
        pending: position.pending,
        maxParallel: position.maxParallel,
      });
      return undefined;
    }

    if (msg.event === "started") {
      const parsed = safeParseJson(msg.data, "started");
      const started = aiChatQueuePositionSchema.parse(parsed);
      onQueueUpdate?.({
        event: "started",
        running: started.running,
        pending: started.pending,
        maxParallel: started.maxParallel,
        queueWaitMs: Math.trunc(started.queueWaitMs ?? 0),
      });
      return undefined;
    }

    if (msg.event === "message_start") {
      const parsed = safeParseJson(msg.data, "message_start");
      onStreamEvent?.({
        event: "message_start",
        data: aiChatModelStreamStartSchema.parse(parsed),
      });
      return undefined;
    }

    if (msg.event === "message_delta") {
      const parsed = safeParseJson(msg.data, "message_delta");
      const deltaData = aiChatModelStreamDeltaSchema.parse(parsed);
      streamedMessageFromDeltas += deltaData.delta;
      onStreamEvent?.({
        event: "message_delta",
        data: deltaData,
      });
      return undefined;
    }

    if (msg.event === "message_done") {
      const parsed = safeParseJson(msg.data, "message_done");
      const doneData = aiChatModelStreamDoneSchema.parse(parsed);
      onStreamEvent?.({ event: "message_done", data: doneData });
      didReceiveMessageDone = true;
      streamedMessageFromDeltas = doneData.message;
      finalMessage = doneData.message;
      return doneData.message;
    }

    if (msg.event === "thinking_delta") {
      const parsed = safeParseJson(msg.data, "thinking_delta");
      onStreamEvent?.({ event: "thinking_delta", data: aiChatThinkingDeltaSchema.parse(parsed) });
      return undefined;
    }

    if (msg.event === "thinking_done") {
      const parsed = safeParseJson(msg.data, "thinking_done");
      onStreamEvent?.({ event: "thinking_done", data: aiChatThinkingDoneSchema.parse(parsed) });
      return undefined;
    }

    return undefined;
  };

  try {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException("Request aborted", "AbortError");
      }

      const { value, done } = await reader.read();
      if (done) break;
      buffer = normalizeSseLineEndings(buffer + decoder.decode(value, { stream: true }));

      while (true) {
        const idx = buffer.indexOf("\n\n");
        if (idx === -1) break;
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        const msg = parseSseMessage(chunk);
        if (!msg) continue;
        const doneMessage = processMessage(msg);
        if (doneMessage !== undefined) return doneMessage;
      }
    }

    buffer = normalizeSseLineEndings(buffer + decoder.decode());
    if (buffer.trim().length > 0) {
      const trailingMessage = parseSseMessage(buffer);
      if (trailingMessage) {
        const doneMessage = processMessage(trailingMessage);
        if (doneMessage !== undefined) return doneMessage;
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (finalMessage !== null) return finalMessage;
  throw new Error("AI chat stream ended unexpectedly");
}

async function getAiToken(options: AiChatClientOptions = {}): Promise<string> {
  if (!options.forceNewToken && cachedToken && tokenIsValid(cachedToken)) {
    return cachedToken.token;
  }

  const response = await fetch("/api/ai/token", {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error("Unable to start chat session. Please refresh and try again.");
  }

  const data: unknown = await response.json();
  const parsed = aiTokenResponseSchema.parse(data);
  const expiresAtMs = new Date(parsed.expiresAt).getTime();

  cachedToken = { token: parsed.token, expiresAtMs };
  return parsed.token;
}

export async function aiChat(
  feature: string,
  request: AiChatRequest,
  options: AiChatClientOptions = {},
): Promise<string> {
  const token = await getAiToken(options);

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    Accept: "text/event-stream",
  };

  const response = await fetch(`/api/ai/chat/${encodeURIComponent(feature)}`, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify(request),
    signal: options.signal,
  });

  if (response.status === 401 && !options.forceNewToken) {
    const refreshed = await getAiToken({ ...options, forceNewToken: true });
    const retry = await fetch(`/api/ai/chat/${encodeURIComponent(feature)}`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${refreshed}`,
        Accept: "text/event-stream",
      },
      body: JSON.stringify(request),
      signal: options.signal,
    });

    if (!retry.ok) {
      throw new Error(`AI chat request failed (HTTP ${retry.status}). Please try again.`);
    }

    await assertSseContentType(retry);

    return readSseStream({
      response: retry,
      signal: options.signal,
      onQueueUpdate: options.onQueueUpdate,
      onStreamEvent: options.onStreamEvent,
    });
  }

  if (!response.ok) {
    throw new Error(`AI chat request failed (HTTP ${response.status}). Please try again.`);
  }

  await assertSseContentType(response);

  return readSseStream({
    response,
    signal: options.signal,
    onQueueUpdate: options.onQueueUpdate,
    onStreamEvent: options.onStreamEvent,
  });
}
