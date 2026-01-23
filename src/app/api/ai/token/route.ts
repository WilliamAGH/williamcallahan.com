import "server-only";

import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { isOperationAllowed } from "@/lib/rate-limiter";
import { createAiGateToken, hashUserAgent } from "@/lib/ai/openai-compatible/gate-token";
import logger from "@/lib/utils/logger";
import { safeJsonParse } from "@/lib/utils/json-utils";

const NO_STORE_HEADERS: HeadersInit = { "Cache-Control": "no-store" };

const TOKEN_RATE_LIMIT = {
  maxRequests: 30,
  windowMs: 60_000,
} as const;

const TOKEN_TTL_MS = 60_000;
const HTTPS_COOKIE_NAME = "__Host-ai_gate_nonce";
const HTTP_COOKIE_NAME = "ai_gate_nonce";

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

function isSecureRequest(request: NextRequest): boolean {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto) {
    return forwardedProto.split(",")[0]?.trim().toLowerCase() === "https";
  }

  const forwarded = request.headers.get("forwarded");
  if (forwarded) {
    const first = forwarded.split(",")[0] ?? "";
    const match = first.match(/proto=([^;]+)/i);
    if (match) {
      return match[1]?.trim().toLowerCase() === "https";
    }
  }

  const forwardedSsl = request.headers.get("x-forwarded-ssl");
  if (forwardedSsl && forwardedSsl.toLowerCase() === "on") {
    return true;
  }

  const cfVisitor = request.headers.get("cf-visitor");
  if (cfVisitor) {
    const parsed = safeJsonParse<{ scheme?: string }>(cfVisitor);
    if (parsed?.scheme && typeof parsed.scheme === "string") {
      return parsed.scheme.toLowerCase() === "https";
    }
  }

  return request.nextUrl.protocol === "https:";
}

export function GET(request: NextRequest): NextResponse {
  const originHost = getRequestOriginHostname(request);
  if (!originHost || !isAllowedHostname(originHost)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE_HEADERS });
  }

  const clientIp = getClientIp(request);
  if (!isOperationAllowed("ai-token", clientIp, TOKEN_RATE_LIMIT)) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again shortly." },
      {
        status: 429,
        headers: {
          ...NO_STORE_HEADERS,
          "Retry-After": "60",
          "X-RateLimit-Limit": String(TOKEN_RATE_LIMIT.maxRequests),
          "X-RateLimit-Window": "60s",
        },
      },
    );
  }

  const secret = process.env.AI_TOKEN_SIGNING_SECRET?.trim();
  if (!secret) {
    logger.error("[AI Token] AI_TOKEN_SIGNING_SECRET is not configured");
    return NextResponse.json({ error: "AI token service not configured" }, { status: 503, headers: NO_STORE_HEADERS });
  }

  const nonce = crypto.randomUUID();
  const userAgent = request.headers.get("user-agent") ?? "";

  const now = Date.now();
  const token = createAiGateToken(secret, {
    v: 1,
    exp: now + TOKEN_TTL_MS,
    n: nonce,
    ip: clientIp,
    ua: hashUserAgent(userAgent),
  });

  const response = NextResponse.json(
    { token, expiresAt: new Date(now + TOKEN_TTL_MS).toISOString() },
    { status: 200, headers: NO_STORE_HEADERS },
  );

  const isHttps = isSecureRequest(request);
  const cookieName = isHttps ? HTTPS_COOKIE_NAME : HTTP_COOKIE_NAME;

  response.cookies.set({
    name: cookieName,
    value: nonce,
    httpOnly: true,
    secure: isHttps,
    sameSite: "strict",
    path: "/",
    maxAge: Math.ceil(TOKEN_TTL_MS / 1000),
  });

  return response;
}
