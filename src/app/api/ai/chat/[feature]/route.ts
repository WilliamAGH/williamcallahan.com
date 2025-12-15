import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod/v4";
import { isOperationAllowed } from "@/lib/rate-limiter";
import { verifyAiGateToken, hashUserAgent } from "@/lib/ai/openai-compatible/gate-token";
import {
  buildChatCompletionsUrl,
  resolveOpenAiCompatibleFeatureConfig,
} from "@/lib/ai/openai-compatible/feature-config";
import { callOpenAiCompatibleChatCompletions } from "@/lib/ai/openai-compatible/openai-compatible-client";
import { getUpstreamRequestQueue } from "@/lib/ai/openai-compatible/upstream-request-queue";
import logger from "@/lib/utils/logger";

const NO_STORE_HEADERS: HeadersInit = { "Cache-Control": "no-store" };
const HTTPS_COOKIE_NAME = "__Host-ai_gate_nonce";
const HTTP_COOKIE_NAME = "ai_gate_nonce";

const CHAT_RATE_LIMIT = {
  maxRequests: 20,
  windowMs: 60_000,
} as const;

const requestBodySchema = z
  .object({
    userText: z.string().min(1).optional(),
    system: z.string().min(1).optional(),
    temperature: z.number().min(0).max(2).optional(),
    conversationId: z.string().uuid().optional(),
    priority: z.number().int().min(-100).max(100).optional(),
    messages: z
      .array(
        z.object({
          role: z.enum(["system", "user", "assistant"]),
          content: z.string().min(1),
        }),
      )
      .min(1)
      .optional(),
  })
  .refine(value => Boolean(value.messages) || Boolean(value.userText), {
    message: "Provide either messages or userText",
  });

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  const raw = forwardedFor?.split(",")[0]?.trim() || cfConnectingIp?.trim();
  return raw || "anonymous";
}

function isAllowedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === "williamcallahan.com" || lower.endsWith(".williamcallahan.com")) return true;
  if (process.env.NODE_ENV !== "production" && (lower === "localhost" || lower === "127.0.0.1")) return true;
  return false;
}

function getRequestOriginHostname(request: NextRequest): string | null {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).hostname;
    } catch {
      return null;
    }
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).hostname;
    } catch {
      return null;
    }
  }

  return null;
}

function getBearerToken(request: NextRequest): string | null {
  const auth = request.headers.get("authorization");
  if (!auth) return null;
  const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return match?.[1]?.trim() || null;
}

function wantsEventStream(request: NextRequest): boolean {
  const accept = request.headers.get("accept")?.toLowerCase();
  return Boolean(accept?.includes("text/event-stream"));
}

function formatSseEvent(args: { event: string; data: unknown }): string {
  return `event: ${args.event}\ndata: ${JSON.stringify(args.data)}\n\n`;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ feature: string }> },
): Promise<NextResponse> {
  const originHost = getRequestOriginHostname(request);
  if (!originHost || !isAllowedHostname(originHost)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE_HEADERS });
  }

  const { feature } = await context.params;

  const clientIp = getClientIp(request);
  const rateKey = `${feature}:${clientIp}`;
  if (!isOperationAllowed("ai-chat", rateKey, CHAT_RATE_LIMIT)) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again shortly." },
      {
        status: 429,
        headers: {
          ...NO_STORE_HEADERS,
          "Retry-After": "60",
          "X-RateLimit-Limit": String(CHAT_RATE_LIMIT.maxRequests),
          "X-RateLimit-Window": "60s",
        },
      },
    );
  }

  const secret = process.env.AI_TOKEN_SIGNING_SECRET?.trim();
  if (!secret) {
    logger.error("[AI Chat] AI_TOKEN_SIGNING_SECRET is not configured");
    return NextResponse.json({ error: "AI chat service not configured" }, { status: 503, headers: NO_STORE_HEADERS });
  }

  const nonceCookie = request.cookies.get(HTTPS_COOKIE_NAME)?.value ?? request.cookies.get(HTTP_COOKIE_NAME)?.value;
  const bearerToken = getBearerToken(request);
  if (!nonceCookie || !bearerToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const userAgent = request.headers.get("user-agent") ?? "";
  const verification = verifyAiGateToken(secret, bearerToken, {
    ip: clientIp,
    ua: hashUserAgent(userAgent),
    nonce: nonceCookie,
  });
  if (!verification.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  }

  let parsedBody: z.infer<typeof requestBodySchema>;
  try {
    const raw = (await request.json()) as unknown;
    parsedBody = requestBodySchema.parse(raw);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Invalid request", details: message },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const messages = parsedBody.messages ?? [
    ...(parsedBody.system ? [{ role: "system" as const, content: parsedBody.system }] : []),
    { role: "user" as const, content: parsedBody.userText ?? "" },
  ];

  const config = resolveOpenAiCompatibleFeatureConfig(feature);
  const url = buildChatCompletionsUrl(config.baseUrl);
  const upstreamKey = `${url}::${config.model}`;
  const queue = getUpstreamRequestQueue({ key: upstreamKey, maxParallel: config.maxParallel });
  const priority = parsedBody.priority ?? 0;

  const start = Date.now();
  try {
    if (wantsEventStream(request)) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const send = (event: string, data: unknown) => {
            controller.enqueue(encoder.encode(formatSseEvent({ event, data })));
          };

          const enqueuedAtMs = Date.now();
          const task = queue.enqueue({
            priority,
            signal: request.signal,
            run: async () => {
              const upstream = await callOpenAiCompatibleChatCompletions({
                url,
                apiKey: config.apiKey,
                request: { model: config.model, messages, temperature: parsedBody.temperature },
                signal: request.signal,
              });
              return upstream.choices[0]?.message.content ?? "";
            },
          });

          const initialPosition = queue.getPosition(task.id);
          send("queued", { ...initialPosition, upstreamKey });

          const intervalMs = 350;
          const interval = setInterval(() => {
            const position = queue.getPosition(task.id);
            if (!position.inQueue) return;
            send("queue", { ...position, upstreamKey });
          }, intervalMs);

          request.signal.addEventListener(
            "abort",
            () => {
              clearInterval(interval);
              controller.close();
            },
            { once: true },
          );

          void task.started
            .then(() => {
              clearInterval(interval);
              send("started", { ...queue.snapshot, upstreamKey, queueWaitMs: Date.now() - enqueuedAtMs });
            })
            .catch(() => {
              clearInterval(interval);
            });

          void task.result
            .then(message => {
              send("done", { message });
              controller.close();
            })
            .catch((error: unknown) => {
              const errorMessage = error instanceof Error ? error.message : String(error);
              const safeMessage =
                process.env.NODE_ENV === "production"
                  ? "Upstream AI service error"
                  : `Upstream AI service error: ${errorMessage}`;
              send("error", { error: safeMessage });
              controller.close();
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

    const enqueuedAtMs = Date.now();
    const task = queue.enqueue({
      priority,
      signal: request.signal,
      run: async () => {
        const upstream = await callOpenAiCompatibleChatCompletions({
          url,
          apiKey: config.apiKey,
          request: { model: config.model, messages, temperature: parsedBody.temperature },
          signal: request.signal,
        });
        return upstream.choices[0]?.message.content ?? "";
      },
    });

    let startedAtMs: number | null = null;
    void task.started.then(() => {
      startedAtMs = Date.now();
    });

    const assistantText = await task.result;

    const durationMs = Date.now() - start;
    const queueWaitMs = startedAtMs ? Math.max(0, startedAtMs - enqueuedAtMs) : 0;
    const conversationIdLog = parsedBody.conversationId ? ` conversationId=${parsedBody.conversationId}` : "";
    logger.info(
      `[AI Chat] feature=${feature} model=${config.model} status=200 durationMs=${durationMs} queueWaitMs=${queueWaitMs}${conversationIdLog}`,
    );

    return NextResponse.json({ message: assistantText }, { status: 200, headers: NO_STORE_HEADERS });
  } catch (error: unknown) {
    const durationMs = Date.now() - start;
    const errorMessage = error instanceof Error ? error.message : String(error);

    const conversationIdLog = parsedBody.conversationId ? ` conversationId=${parsedBody.conversationId}` : "";
    logger.error(
      `[AI Chat] feature=${feature} model=${config.model} status=502 durationMs=${durationMs}${conversationIdLog}`,
      errorMessage,
    );

    const safeMessage =
      process.env.NODE_ENV === "production"
        ? "Upstream AI service error"
        : `Upstream AI service error: ${errorMessage}`;

    return NextResponse.json({ error: safeMessage }, { status: 502, headers: NO_STORE_HEADERS });
  }
}
