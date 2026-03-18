/**
 * Shared Sentry environment resolver.
 *
 * Derives a deployment-specific Sentry environment name from NEXT_PUBLIC_SITE_URL.
 * This is the single canonical owner (SS1a) for Sentry environment resolution
 * across all three instrumentation runtimes (Node, Edge, Client).
 *
 * The @sentry/nextjs SDK defaults environment to NODE_ENV ("production") which
 * provides no deployment discrimination. This function extracts a meaningful name:
 *   - "https://williamcallahan.com"       → "production"
 *   - "https://alpha.williamcallahan.com"  → "alpha"
 *   - "http://localhost:3000"              → "local"
 *   - unset / unrecognized                 → falls back to NODE_ENV
 *
 * Runtime compatibility: uses only `process.env`, `URL`, and `String.prototype.match`
 * — all available in Node.js, Edge, and browser (via Next.js build-time inlining).
 *
 * @module sentry/resolve-environment
 */

import { PRODUCTION_HOSTNAME, SUBDOMAIN_PATTERN } from "@/lib/config/site-identity";

export function resolveSentryEnvironment(): string {
  const rawNodeEnv = process.env.NODE_ENV?.trim();
  if (!rawNodeEnv) {
    console.warn('[sentry/resolve-environment] NODE_ENV is unset; defaulting to "production".');
  }
  const nodeEnv = rawNodeEnv || "production";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!siteUrl) {
    console.warn(
      "[sentry/resolve-environment] NEXT_PUBLIC_SITE_URL is unset; falling back to NODE_ENV.",
    );
    return nodeEnv;
  }

  try {
    const url = new URL(siteUrl);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return "local";
    if (url.hostname === PRODUCTION_HOSTNAME) return "production";

    const subdomainMatch = url.hostname.match(SUBDOMAIN_PATTERN);
    if (subdomainMatch?.[1]) return subdomainMatch[1];
    console.warn(
      `[sentry/resolve-environment] Unrecognized hostname "${url.hostname}"; falling back to NODE_ENV.`,
    );
  } catch {
    console.warn(
      `[sentry/resolve-environment] Invalid NEXT_PUBLIC_SITE_URL "${siteUrl}"; falling back to NODE_ENV.`,
    );
  }

  return nodeEnv;
}
