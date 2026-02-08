import crypto from "crypto";
import fs from "fs";
import path from "path";

// Load environment variables manually
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  envContent.split("\n").forEach((line) => {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) return;
    const separatorIndex = trimmedLine.indexOf("=");
    if (separatorIndex === -1) return;
    const key = trimmedLine.slice(0, separatorIndex).trim();
    const value = trimmedLine.slice(separatorIndex + 1).trim();
    if (!key) return;
    process.env[key] = value;
  });
}

const secret = process.env.AI_TOKEN_SIGNING_SECRET;
if (!secret) {
  console.error("Error: AI_TOKEN_SIGNING_SECRET not found in .env");
  process.exit(1);
}

function base64UrlEncode(input: Buffer | string): string {
  const buffer = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function hmacSha256Base64Url(secret: string, data: string): string {
  const digest = crypto.createHmac("sha256", secret).update(data, "utf8").digest();
  return base64UrlEncode(digest);
}

function hashUserAgent(userAgent: string): string {
  return crypto.createHash("sha256").update(userAgent, "utf8").digest("hex");
}

const now = Date.now();
const nonce = "debug-nonce-" + now;
const ip = "::1"; // IPv6 localhost as seen in curl
const userAgent = "curl/8.7.1"; // As seen in curl
const payload = {
  v: 1,
  exp: now + 3600000,
  n: nonce,
  ip: ip,
  ua: hashUserAgent(userAgent),
};

const payloadJson = JSON.stringify(payload);
const payloadB64 = base64UrlEncode(payloadJson);
const sig = hmacSha256Base64Url(secret, payloadB64);
const token = `${payloadB64}.${sig}`;

console.log(`${token}|${nonce}`);
