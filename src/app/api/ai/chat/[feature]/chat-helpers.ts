/**
 * AI Chat Route Helpers
 *
 * Extracted helper functions for the AI chat route handler.
 * Decomposed for [FN1] Small and [FN2] Single Responsibility compliance.
 *
 * @module api/ai/chat/chat-helpers
 */

import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { isOperationAllowed } from "@/lib/rate-limiter";
import { verifyAiGateToken, hashUserAgent } from "@/lib/ai/openai-compatible/gate-token";
import { logChatMessage } from "@/lib/ai/openai-compatible/chat-message-logger";
import { buildContextForQuery } from "@/lib/ai/rag";
import { getClientIp } from "@/lib/utils/request-utils";
import { NO_STORE_HEADERS, preventCaching, requireCloudflareHeaders } from "@/lib/utils/api-utils";
import logger from "@/lib/utils/logger";
import {
  type ChatLogContext,
  type RagContextStatus,
  type ValidatedRequestContext,
} from "@/types/features/ai-chat";
import { requestBodySchema, type ParsedRequestBody } from "@/types/schemas/ai-chat";

const HTTPS_COOKIE_NAME = "__Host-ai_gate_nonce";

const HTTP_COOKIE_NAME = "ai_gate_nonce";

const CHAT_RATE_LIMIT = {
  maxRequests: 20,
  windowMs: 60_000,
} as const;

export { requestBodySchema };

function isAllowedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === "williamcallahan.com" || lower.endsWith(".williamcallahan.com")) return true;
  if (process.env.NODE_ENV !== "production" && (lower === "localhost" || lower === "127.0.0.1"))
    return true;
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

function getRequestPagePath(request: NextRequest): string | null {
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).pathname;
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

export function wantsEventStream(request: NextRequest): boolean {
  const accept = request.headers.get("accept")?.toLowerCase();
  return Boolean(accept?.includes("text/event-stream"));
}

export function formatSseEvent(args: { event: string; data: unknown }): string {
  return `event: ${args.event}\ndata: ${JSON.stringify(args.data)}\n\n`;
}

/**
 * Validate the incoming request (cloudflare, origin, rate limit, auth, body)
 * Returns either an error response or the validated context
 */
export async function validateRequest(
  request: NextRequest,
  feature: string,
): Promise<NextResponse | ValidatedRequestContext> {
  preventCaching();

  const cloudflareResponse = requireCloudflareHeaders(request.headers, {
    route: "/api/ai/chat",
    additionalHeaders: NO_STORE_HEADERS,
  });
  if (cloudflareResponse) return cloudflareResponse;

  const originHost = getRequestOriginHostname(request);
  if (!originHost || !isAllowedHostname(originHost)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE_HEADERS });
  }

  const clientIp = getClientIp(request.headers, { fallback: "anonymous" });
  const pagePath = getRequestPagePath(request);
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
    return NextResponse.json(
      { error: "AI chat service not configured" },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  const nonceCookie =
    request.cookies.get(HTTPS_COOKIE_NAME)?.value ?? request.cookies.get(HTTP_COOKIE_NAME)?.value;
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

  let parsedBody: ParsedRequestBody;
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

  return { feature, clientIp, pagePath, originHost, userAgent, parsedBody };
}

/**
 * Build RAG context for terminal_chat feature
 */
export async function buildRagContextForChat(
  feature: string,
  parsedBody: ParsedRequestBody,
): Promise<{ augmentedPrompt: string | undefined; status: RagContextStatus }> {
  if (feature !== "terminal_chat") {
    return { augmentedPrompt: undefined, status: "not_applicable" };
  }

  const messagesArray = Array.isArray(parsedBody.messages) ? parsedBody.messages : undefined;
  const userMessage =
    parsedBody.userText ?? messagesArray?.findLast((m) => m.role === "user")?.content;

  if (!userMessage) {
    return { augmentedPrompt: undefined, status: "not_applicable" };
  }

  try {
    const ragContext = await buildContextForQuery(userMessage, {
      maxTokens: 8000,
      timeoutMs: 3000,
      includeInventory: true,
      inventoryMaxTokens: 6000,
    });

    if (ragContext.retrievalStatus === "success") {
      return { augmentedPrompt: ragContext.contextText, status: "included" };
    } else if (ragContext.retrievalStatus === "partial") {
      logger.warn("[AI Chat] RAG context retrieval partial", {
        failedScopes: ragContext.failedScopes,
      });
      return { augmentedPrompt: ragContext.contextText, status: "partial" };
    } else {
      logger.warn("[AI Chat] RAG context retrieval failed", {
        status: ragContext.retrievalStatus,
      });
      return { augmentedPrompt: undefined, status: "failed" };
    }
  } catch (error) {
    logger.warn("[AI Chat] RAG context retrieval exception:", { error });
    return { augmentedPrompt: undefined, status: "failed" };
  }
}

/** Log a successful chat completion */
export function logSuccessfulChat(
  ctx: ChatLogContext,
  assistantMessage: string,
  durationMs: number,
  queueWaitMs: number,
): void {
  logChatMessage({
    feature: ctx.feature,
    conversationId: ctx.conversationId,
    clientIp: ctx.clientIp,
    userAgent: ctx.userAgent,
    originHost: ctx.originHost,
    pagePath: ctx.pagePath ?? undefined,
    messages: ctx.messages,
    assistantMessage,
    metrics: {
      durationMs,
      queueWaitMs,
      model: ctx.model,
      statusCode: 200,
      priority: ctx.priority,
    },
    success: true,
  });
}

/** Log a failed chat completion */
export function logFailedChat(
  ctx: ChatLogContext,
  errorMessage: string,
  durationMs: number,
  queueWaitMs: number,
  statusCode = 502,
): void {
  logChatMessage({
    feature: ctx.feature,
    conversationId: ctx.conversationId,
    clientIp: ctx.clientIp,
    userAgent: ctx.userAgent,
    originHost: ctx.originHost,
    pagePath: ctx.pagePath ?? undefined,
    messages: ctx.messages,
    metrics: {
      durationMs,
      queueWaitMs,
      model: ctx.model,
      statusCode,
      priority: ctx.priority,
    },
    success: false,
    errorMessage,
  });
}

/** Format error message for response (sanitized in production) */
export function formatErrorMessage(error: unknown): string {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return process.env.NODE_ENV === "production"
    ? "Upstream AI service error"
    : `Upstream AI service error: ${errorMessage}`;
}
