/**
 * HTTP Request Utilities
 *
 * Shared utilities for extracting client information from HTTP requests.
 * Provides consistent IP detection across proxy headers (Cloudflare, nginx, etc.)
 *
 * @module lib/utils/request-utils
 */

import { BlockList, isIPv4, isIPv6 } from "node:net";
import type { CloudflareHeaderValidation } from "@/types/http";
import type { ProxyRequestClass } from "@/types/middleware";

const CLOUDFLARE_REQUIRED_HEADERS = ["CF-Ray"] as const;
const CLOUDFLARE_IP_HEADERS = ["CF-Connecting-IP", "True-Client-IP"] as const;
const PREFETCH_HINT_VALUES = new Set(["prefetch", "prerender"]);

// Canonical source: https://www.cloudflare.com/ips/
const CLOUDFLARE_IPV4_SUBNETS = [
  ["173.245.48.0", 20],
  ["103.21.244.0", 22],
  ["103.22.200.0", 22],
  ["103.31.4.0", 22],
  ["141.101.64.0", 18],
  ["108.162.192.0", 18],
  ["190.93.240.0", 20],
  ["188.114.96.0", 20],
  ["197.234.240.0", 22],
  ["198.41.128.0", 17],
  ["162.158.0.0", 15],
  ["104.16.0.0", 13],
  ["104.24.0.0", 14],
  ["172.64.0.0", 13],
  ["131.0.72.0", 22],
] as const;
const CLOUDFLARE_IPV6_SUBNETS = [
  ["2400:cb00::", 32],
  ["2606:4700::", 32],
  ["2803:f800::", 32],
  ["2405:b500::", 32],
  ["2405:8100::", 32],
  ["2a06:98c0::", 29],
  ["2c0f:f248::", 32],
] as const;

const CLOUDFLARE_NETWORKS = new BlockList();
for (const [network, prefix] of CLOUDFLARE_IPV4_SUBNETS) {
  CLOUDFLARE_NETWORKS.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of CLOUDFLARE_IPV6_SUBNETS) {
  CLOUDFLARE_NETWORKS.addSubnet(network, prefix, "ipv6");
}

function getValidIp(value: string | undefined): string | undefined {
  const candidate = value?.trim();
  return candidate && (isIPv4(candidate) || isIPv6(candidate)) ? candidate : undefined;
}

function getProxyPeerIp(headers: Headers): string | undefined {
  const forwardedChain = headers.get("x-forwarded-for")?.split(",").toReversed();
  const forwardedPeer = forwardedChain?.map((value) => getValidIp(value)).find(Boolean);
  return forwardedPeer ?? getValidIp(headers.get("x-real-ip") ?? undefined);
}

function isCloudflareIp(ip: string): boolean {
  if (isIPv4(ip)) return CLOUDFLARE_NETWORKS.check(ip, "ipv4");
  if (isIPv6(ip)) return CLOUDFLARE_NETWORKS.check(ip, "ipv6");
  return false;
}

function getCloudflareClientIp(headers: Headers): string | undefined {
  for (const header of CLOUDFLARE_IP_HEADERS) {
    const ip = getValidIp(headers.get(header)?.split(",")[0]);
    if (ip) return ip;
  }
  return undefined;
}

/**
 * Extracts the client IP address from HTTP headers.
 * Uses the reverse proxy's immediate peer and accepts a Cloudflare-provided
 * client address only when that peer belongs to a published Cloudflare range.
 *
 * @param headers - The Headers object from the request
 * @param options - Configuration options
 * @returns The client IP address or the fallback value
 *
 * @example
 * // In a Next.js API route:
 * const ip = getClientIp(request.headers);
 *
 * // With custom fallback:
 * const ip = getClientIp(request.headers, { fallback: "anonymous" });
 */
export function getClientIp(headers: Headers, options: { fallback?: string } = {}): string {
  const peerIp = getProxyPeerIp(headers);
  if (!peerIp) return options.fallback ?? "unknown";
  if (!isCloudflareIp(peerIp)) return peerIp;
  return getCloudflareClientIp(headers) ?? peerIp;
}

function normalizeHeaderValue(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export function validateCloudflareHeaders(headers: Headers): CloudflareHeaderValidation {
  const host = normalizeHeaderValue(headers.get("host"));
  const cfRay = normalizeHeaderValue(headers.get(CLOUDFLARE_REQUIRED_HEADERS[0]));
  const cfConnectingIp = normalizeHeaderValue(headers.get(CLOUDFLARE_IP_HEADERS[0]));
  const trueClientIp = normalizeHeaderValue(headers.get(CLOUDFLARE_IP_HEADERS[1]));
  const forwardedProto = normalizeHeaderValue(headers.get("x-forwarded-proto"));
  const peerIp = getProxyPeerIp(headers);
  const candidateIp = (cfConnectingIp ?? trueClientIp)?.split(",")[0]?.trim();

  const reasons: string[] = [];

  if (!cfRay) {
    reasons.push("missing_cf_ray");
  }

  if (!peerIp || !isCloudflareIp(peerIp)) {
    reasons.push("untrusted_proxy");
  }

  if (!candidateIp) {
    reasons.push("missing_cf_ip");
  } else if (!getValidIp(candidateIp)) {
    reasons.push("invalid_cf_ip");
  }

  return {
    isValid: reasons.length === 0,
    reasons,
    details: {
      host,
      cfRay,
      cfConnectingIp,
      trueClientIp,
      forwardedProto,
    },
  };
}

function hasPrefetchHeader(headers: Headers): boolean {
  if (headers.has("next-router-prefetch")) return true;

  const purpose = normalizeHeaderValue(headers.get("purpose"))?.toLowerCase();
  if (purpose && PREFETCH_HINT_VALUES.has(purpose)) return true;

  const secPurpose = normalizeHeaderValue(headers.get("sec-purpose"))?.toLowerCase();
  if (secPurpose && PREFETCH_HINT_VALUES.has(secPurpose)) return true;

  return false;
}

function isRscRequest(pathname: string, searchParams: URLSearchParams, headers: Headers): boolean {
  if (searchParams.has("_rsc")) return true;

  const rscHeader = normalizeHeaderValue(headers.get("rsc"));
  if (rscHeader === "1") return true;

  const accept = normalizeHeaderValue(headers.get("accept"))?.toLowerCase();
  if (accept?.includes("text/x-component")) return true;

  return pathname.endsWith(".rsc");
}

/** FNV-1a hash of an IP string, formatted as a hex bucket ID for structured
 *  logs. Avoids logging raw IPs while preserving per-client cardinality. */
export function hashIpBucket(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    const codePoint = input.codePointAt(i);
    if (codePoint === undefined) continue;
    hash ^= codePoint;
    hash = Math.imul(hash, 16777619);
  }
  return `ip-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function classifyProxyRequest(
  request: Pick<Request, "method" | "url" | "headers">,
): ProxyRequestClass {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const method = request.method.toUpperCase();
  const accept = normalizeHeaderValue(request.headers.get("accept"))?.toLowerCase() ?? "";
  const secFetchDest = normalizeHeaderValue(request.headers.get("sec-fetch-dest"))?.toLowerCase();
  const secFetchMode = normalizeHeaderValue(request.headers.get("sec-fetch-mode"))?.toLowerCase();
  const isPageMethod = method === "GET" || method === "HEAD";

  if (pathname.startsWith("/api/")) return "api";
  if (pathname.startsWith("/_next/image")) return "image";
  if (hasPrefetchHeader(request.headers)) return "prefetch";
  if (isRscRequest(pathname, url.searchParams, request.headers)) return "rsc";
  if (
    isPageMethod &&
    (accept.includes("text/html") ||
      secFetchDest === "document" ||
      secFetchMode === "navigate" ||
      !pathname.includes("."))
  ) {
    return "document";
  }

  return "other";
}

/** True when the proxy must prevent browser/CDN caching for an HTML route. */
export function shouldApplyHtmlCachePolicy(pathname: string): boolean {
  return !pathname.startsWith("/api/") && (pathname === "/" || !pathname.includes("."));
}
