import type { AiBrowserTokenCache, AiChatClientOptions, AiChatRequest } from "@/types/ai-openai-compatible-client";
import {
  aiChatQueuePositionSchema,
  aiChatResponseSchema,
  aiChatStreamErrorSchema,
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

async function readSseStream(args: {
  response: Response;
  signal?: AbortSignal;
  onQueueUpdate?: AiChatClientOptions["onQueueUpdate"];
}): Promise<string> {
  const { response, signal, onQueueUpdate } = args;
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("AI chat stream is not readable");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException("Request aborted", "AbortError");
      }

      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const idx = buffer.indexOf("\n\n");
        if (idx === -1) break;
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        const msg = parseSseMessage(chunk);
        if (!msg) continue;

        if (msg.event === "done") {
          const parsed = safeParseJson(msg.data, "done");
          return aiChatResponseSchema.parse(parsed).message;
        }

        if (msg.event === "error") {
          const parsed = safeParseJson(msg.data, "error");
          const errorObj = aiChatStreamErrorSchema.parse(parsed);
          throw new Error(errorObj.error);
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
          continue;
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
          continue;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

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
    const text = await response.text();
    throw new Error(`Failed to mint AI token (HTTP ${response.status}): ${text || response.statusText}`);
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

  const wantsQueueUpdates = typeof options.onQueueUpdate === "function";
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    ...(wantsQueueUpdates ? { Accept: "text/event-stream" } : {}),
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
        ...(wantsQueueUpdates ? { Accept: "text/event-stream" } : {}),
      },
      body: JSON.stringify(request),
      signal: options.signal,
    });

    if (!retry.ok) {
      const text = await retry.text();
      throw new Error(`AI chat failed (HTTP ${retry.status}): ${text}`);
    }

    if (wantsQueueUpdates) {
      return readSseStream({
        response: retry,
        signal: options.signal,
        onQueueUpdate: options.onQueueUpdate,
      });
    }

    const data: unknown = await retry.json();
    return aiChatResponseSchema.parse(data).message;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI chat failed (HTTP ${response.status}): ${text}`);
  }

  if (wantsQueueUpdates) {
    return readSseStream({
      response,
      signal: options.signal,
      onQueueUpdate: options.onQueueUpdate,
    });
  }

  const data: unknown = await response.json();
  return aiChatResponseSchema.parse(data).message;
}
