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

const PRODUCTION_HOSTNAME = "williamcallahan.com";
const SUBDOMAIN_PATTERN = /^([^.]+)\.williamcallahan\.com$/;

export function resolveSentryEnvironment(): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!siteUrl) return process.env.NODE_ENV ?? "production";

  try {
    const url = new URL(siteUrl);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return "local";
    if (url.hostname === PRODUCTION_HOSTNAME) return "production";

    const subdomainMatch = url.hostname.match(SUBDOMAIN_PATTERN);
    if (subdomainMatch?.[1]) return subdomainMatch[1];
  } catch {
    // Unparseable URL — fall through
  }

  return process.env.NODE_ENV ?? "production";
}
