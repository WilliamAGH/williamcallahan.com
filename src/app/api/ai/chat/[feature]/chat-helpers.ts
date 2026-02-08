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
import {
  getAiGateNonceCookie,
  getBearerTokenFromRequest,
  getRequestOriginHostname,
  getRequestPagePath,
  hashUserAgent,
  isAllowedAiGateHostname,
  verifyAiGateToken,
} from "@/lib/ai/openai-compatible/gate-token";
import { logChatMessage } from "@/lib/ai/openai-compatible/chat-message-logger";
import { buildContextForQuery } from "@/lib/ai/rag";
import { isPaginationKeyword } from "@/lib/ai/rag/inventory-pagination";
import { memoryPressureMiddleware } from "@/lib/middleware/memory-pressure";
import { getClientIp } from "@/lib/utils/request-utils";
import {
  NO_STORE_HEADERS,
  buildApiRateLimitResponse,
  preventCaching,
  requireCloudflareHeaders,
} from "@/lib/utils/api-utils";
import logger from "@/lib/utils/logger";
import {
  type ChatLogContext,
  type RagContextStatus,
  type ValidatedRequestContext,
} from "@/types/features/ai-chat";
import { requestBodySchema, type ParsedRequestBody } from "@/types/schemas/ai-chat";

const CHAT_RATE_LIMIT = {
  maxRequests: 20,
  windowMs: 60_000,
} as const;

/** Anaphoric pronouns — when detected (without a domain hint), `resolveRetrievalQuery`
 *  merges the current + previous message so RAG can resolve the reference.
 *  Same pronouns appear as stop words in `dynamic-searchers.ts` (separate pipeline). */
const ANAPHORA_PATTERN = /\b(them|those|that|it|this|these|ones)\b/i;
/** Suppresses anaphora expansion when the user explicitly names a content domain. */
const DOMAIN_HINT_PATTERN =
  /\b(bookmarks?|links?|resources?|wikipedia|projects?|blog|posts?|books?|investments?)\b/i;
/** Triggers full-inventory RAG section with server-side pagination. */
const INVENTORY_REQUEST_PATTERN = /\b(all|list|catalog|inventory|show all|everything)\b/i;

/** RAG token budget when inventory content is included */
const RAG_INVENTORY_MAX_TOKENS = 8000;
/** RAG token budget for standard non-inventory queries */
const RAG_STANDARD_MAX_TOKENS = 4500;
/** Maximum tokens allocated to inventory section within RAG */
const RAG_INVENTORY_SECTION_MAX_TOKENS = 5000;
/** Default number of inventory items per page */
const INVENTORY_PAGE_SIZE = 25;

function withSystemStatusHeader(
  response: NextResponse,
  systemStatus: "MEMORY_WARNING" | undefined,
): NextResponse {
  if (systemStatus) {
    response.headers.set("X-System-Status", systemStatus);
  }
  return response;
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

  const memoryResponse = await memoryPressureMiddleware(request);
  const memoryWarningStatus = memoryResponse?.headers.get("X-System-Status");
  const systemStatus: "MEMORY_WARNING" | undefined =
    memoryWarningStatus === "MEMORY_WARNING" ? memoryWarningStatus : undefined;
  if (memoryResponse && memoryResponse.status >= 400) {
    return memoryResponse;
  }
  const clientIp = getClientIp(request.headers, { fallback: "anonymous" });

  const acceptHeaderRaw = request.headers.get("accept");
  if (!acceptHeaderRaw) {
    logger.warn("[AI Chat] Missing Accept header on incoming request", { feature, clientIp });
    return withSystemStatusHeader(
      NextResponse.json(
        { error: "Not Acceptable: this endpoint requires Accept: text/event-stream" },
        { status: 406, headers: NO_STORE_HEADERS },
      ),
      systemStatus,
    );
  }
  const acceptHeader = acceptHeaderRaw.toLowerCase();
  if (!acceptHeader.includes("text/event-stream")) {
    return withSystemStatusHeader(
      NextResponse.json(
        { error: "Not Acceptable: this endpoint requires Accept: text/event-stream" },
        { status: 406, headers: NO_STORE_HEADERS },
      ),
      systemStatus,
    );
  }

  const cloudflareResponse = requireCloudflareHeaders(request.headers, {
    route: "/api/ai/chat",
    additionalHeaders: NO_STORE_HEADERS,
  });
  if (cloudflareResponse) return withSystemStatusHeader(cloudflareResponse, systemStatus);

  const originHost = getRequestOriginHostname(request);
  if (!originHost || !isAllowedAiGateHostname(originHost)) {
    return withSystemStatusHeader(
      NextResponse.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE_HEADERS }),
      systemStatus,
    );
  }

  const pagePath = getRequestPagePath(request);
  const rateKey = `${feature}:${clientIp}`;

  if (!isOperationAllowed("ai-chat", rateKey, CHAT_RATE_LIMIT)) {
    return withSystemStatusHeader(
      buildApiRateLimitResponse({
        retryAfterSeconds: Math.ceil(CHAT_RATE_LIMIT.windowMs / 1000),
        rateLimitScope: "ai-chat",
        rateLimitLimit: CHAT_RATE_LIMIT.maxRequests,
        rateLimitWindowSeconds: Math.ceil(CHAT_RATE_LIMIT.windowMs / 1000),
      }),
      systemStatus,
    );
  }

  const secret = process.env.AI_TOKEN_SIGNING_SECRET?.trim();
  if (!secret) {
    logger.error("[AI Chat] AI_TOKEN_SIGNING_SECRET is not configured");
    return withSystemStatusHeader(
      NextResponse.json(
        { error: "AI chat service not configured" },
        { status: 503, headers: NO_STORE_HEADERS },
      ),
      systemStatus,
    );
  }

  const nonceCookie = getAiGateNonceCookie(request);
  const bearerToken = getBearerTokenFromRequest(request);
  if (!nonceCookie || !bearerToken) {
    return withSystemStatusHeader(
      NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS }),
      systemStatus,
    );
  }

  const userAgentHeader = request.headers.get("user-agent");
  if (!userAgentHeader) {
    logger.warn("[AI Chat] Missing User-Agent header on incoming request", { feature, clientIp });
  }
  const userAgent = userAgentHeader ?? "unknown";
  const verification = verifyAiGateToken(secret, bearerToken, {
    ip: clientIp,
    ua: hashUserAgent(userAgent),
    nonce: nonceCookie,
  });
  if (!verification.ok) {
    return withSystemStatusHeader(
      NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS }),
      systemStatus,
    );
  }

  let parsedBody: ParsedRequestBody;
  try {
    const raw = (await request.json()) as unknown;
    parsedBody = requestBodySchema.parse(raw);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return withSystemStatusHeader(
      NextResponse.json(
        { error: "Invalid request", details: message },
        { status: 400, headers: NO_STORE_HEADERS },
      ),
      systemStatus,
    );
  }

  return { feature, clientIp, pagePath, originHost, userAgent, systemStatus, parsedBody };
}

function getUserMessages(parsedBody: ParsedRequestBody): string[] {
  const messagesArray = Array.isArray(parsedBody.messages) ? parsedBody.messages : [];
  const fromHistory = messagesArray
    .filter((message) => message.role === "user")
    .map((message) => message.content.trim())
    .filter((content) => content.length > 0);

  const directMessage = parsedBody.userText?.trim();
  if (
    directMessage &&
    (fromHistory.length === 0 || fromHistory[fromHistory.length - 1] !== directMessage)
  ) {
    fromHistory.push(directMessage);
  }

  return fromHistory;
}

function resolveRetrievalQuery(userMessages: string[]): string | undefined {
  const current = userMessages[userMessages.length - 1];
  if (!current) return undefined;

  const previous = userMessages[userMessages.length - 2];
  const isAnaphoric = ANAPHORA_PATTERN.test(current) && !DOMAIN_HINT_PATTERN.test(current);

  if (isAnaphoric && previous) {
    return `${previous} ${current}`;
  }

  return current;
}

function shouldIncludeInventory(userMessage: string, isPaginating: boolean): boolean {
  return isPaginating || INVENTORY_REQUEST_PATTERN.test(userMessage);
}

/**
 * Build RAG context for terminal_chat feature.
 * Supports server-side pagination for large inventory sections.
 */
export async function buildRagContextForChat(
  feature: string,
  parsedBody: ParsedRequestBody,
): Promise<{ augmentedPrompt: string | undefined; status: RagContextStatus }> {
  if (feature !== "terminal_chat") {
    return { augmentedPrompt: undefined, status: "not_applicable" };
  }

  const userMessages = getUserMessages(parsedBody);
  const userMessage = userMessages[userMessages.length - 1];
  const retrievalQuery = resolveRetrievalQuery(userMessages);

  if (!userMessage || !retrievalQuery) {
    return { augmentedPrompt: undefined, status: "not_applicable" };
  }

  // Detect if user is requesting pagination (e.g., "next", "more")
  const isPaginating = isPaginationKeyword(userMessage);
  const includeInventory = shouldIncludeInventory(userMessage, isPaginating);
  const conversationId = parsedBody.conversationId;

  try {
    const ragContext = await buildContextForQuery(retrievalQuery, {
      maxTokens: includeInventory ? RAG_INVENTORY_MAX_TOKENS : RAG_STANDARD_MAX_TOKENS,
      timeoutMs: 5000,
      includeInventory,
      inventoryMaxTokens: includeInventory ? RAG_INVENTORY_SECTION_MAX_TOKENS : 0,
      // Enable pagination when we have a conversationId
      conversationId,
      isPaginationRequest: isPaginating,
      inventoryPagination: {
        pageSize: INVENTORY_PAGE_SIZE,
      },
    });

    if (ragContext.retrievalStatus === "success") {
      return { augmentedPrompt: ragContext.contextText, status: "included" };
    } else if (ragContext.retrievalStatus === "partial") {
      logger.warn("[AI Chat] RAG context retrieval partial", {
        failedScopes: ragContext.failedScopes,
      });
      return { augmentedPrompt: ragContext.contextText, status: "partial" };
    } else {
      logger.error("[AI Chat] RAG context retrieval failed", {
        status: ragContext.retrievalStatus,
      });
      return { augmentedPrompt: undefined, status: "failed" };
    }
  } catch (error) {
    logger.error("[AI Chat] RAG context retrieval exception:", { error });
    return { augmentedPrompt: undefined, status: "failed" };
  }
}

/** Build shared log payload fields common to both success and failure logging */
function buildBaseLogPayload(ctx: ChatLogContext, durationMs: number, queueWaitMs: number) {
  return {
    feature: ctx.feature,
    conversationId: ctx.conversationId,
    clientIp: ctx.clientIp,
    userAgent: ctx.userAgent,
    originHost: ctx.originHost,
    pagePath: ctx.pagePath === null ? undefined : ctx.pagePath,
    messages: ctx.messages,
    metrics: {
      durationMs,
      queueWaitMs,
      model: ctx.model,
      priority: ctx.priority,
    },
  };
}

/** Log a successful chat completion */
export function logSuccessfulChat(
  ctx: ChatLogContext,
  assistantMessage: string,
  durationMs: number,
  queueWaitMs: number,
): void {
  const base = buildBaseLogPayload(ctx, durationMs, queueWaitMs);
  logChatMessage({
    ...base,
    assistantMessage,
    metrics: { ...base.metrics, statusCode: 200 },
    success: true,
  });
}

/** Log a failed chat completion */
export function logFailedChat(params: {
  ctx: ChatLogContext;
  errorMessage: string;
  durationMs: number;
  queueWaitMs: number;
  statusCode?: number;
}): void {
  const { ctx, errorMessage, durationMs, queueWaitMs, statusCode = 502 } = params;
  const base = buildBaseLogPayload(ctx, durationMs, queueWaitMs);
  logChatMessage({
    ...base,
    metrics: { ...base.metrics, statusCode },
    success: false,
    errorMessage,
  });
}
