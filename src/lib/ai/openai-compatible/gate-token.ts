import "server-only";

import crypto from "node:crypto";
import type {
  AiGateTokenPayloadV1,
  AiGateTokenVerificationResult,
} from "@/types/ai-openai-compatible";

function base64UrlEncode(input: Buffer | string): string {
  const buffer = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecodeToBuffer(input: string): Buffer | null {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = `${normalized}${"=".repeat(padLength)}`;

  try {
    return Buffer.from(padded, "base64");
  } catch {
    return null;
  }
}

function hmacSha256Base64Url(secret: string, data: string): string {
  const digest = crypto.createHmac("sha256", secret).update(data, "utf8").digest();
  return base64UrlEncode(digest);
}

export function hashUserAgent(userAgent: string): string {
  return crypto.createHash("sha256").update(userAgent, "utf8").digest("hex");
}

export function createAiGateToken(secret: string, payload: AiGateTokenPayloadV1): string {
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = base64UrlEncode(payloadJson);
  const sig = hmacSha256Base64Url(secret, payloadB64);
  return `${payloadB64}.${sig}`;
}

function parseAiGateTokenPayload(payload: unknown): AiGateTokenPayloadV1 | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (record.v !== 1) return null;

  const exp = record.exp;
  const n = record.n;
  const ip = record.ip;
  const ua = record.ua;

  if (
    typeof exp !== "number" ||
    typeof n !== "string" ||
    typeof ip !== "string" ||
    typeof ua !== "string"
  ) {
    return null;
  }

  return { v: 1, exp, n, ip, ua };
}

export function verifyAiGateToken(
  secret: string,
  token: string,
  expected: { ip: string; ua: string; nonce: string },
  nowMs = Date.now(),
): AiGateTokenVerificationResult {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "invalid_format" };

  const [payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return { ok: false, reason: "invalid_format" };

  const expectedSig = hmacSha256Base64Url(secret, payloadB64);

  const sigBuf = base64UrlDecodeToBuffer(sig);
  const expectedBuf = base64UrlDecodeToBuffer(expectedSig);
  if (!sigBuf || !expectedBuf) return { ok: false, reason: "invalid_signature" };
  if (sigBuf.length !== expectedBuf.length) return { ok: false, reason: "invalid_signature" };
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf))
    return { ok: false, reason: "invalid_signature" };

  const payloadBuf = base64UrlDecodeToBuffer(payloadB64);
  if (!payloadBuf) return { ok: false, reason: "invalid_format" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadBuf.toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid_format" };
  }

  const payload = parseAiGateTokenPayload(parsed);
  if (!payload) return { ok: false, reason: "invalid_format" };

  if (nowMs > payload.exp) return { ok: false, reason: "expired" };

  if (payload.ip !== expected.ip || payload.ua !== expected.ua || payload.n !== expected.nonce) {
    return { ok: false, reason: "mismatch" };
  }

  return { ok: true, payload };
}
