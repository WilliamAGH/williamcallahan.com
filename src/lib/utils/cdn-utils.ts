/**
 * CDN URL Builder Utilities
 *
 * Consistent CDN URL generation across services
 * Handles both CDN and S3 direct URLs
 */

import type { CdnConfig } from "@/types/s3-cdn";

const SUPPORTED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Get S3 CDN base URL with consistent fallback chain
 *
 * Server-side: S3_CDN_URL takes precedence (not exposed to client)
 * Client-side: Falls back to NEXT_PUBLIC_S3_CDN_URL
 *
 * Returns empty string if neither is configured.
 *
 * @see {@link getCdnConfigFromEnv} for full configuration object
 */
export function getS3CdnUrl(): string {
  return process.env.S3_CDN_URL || process.env.NEXT_PUBLIC_S3_CDN_URL || "";
}

function parseAbsoluteUrl(value?: string): URL | null {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function normalizeBasePath(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

/**
 * Capture CDN URL at module load time for client-side access
 * Next.js inlines NEXT_PUBLIC_* env vars at build time, so this constant
 * will have the value available even in client components.
 * Fallback ensures we have a value even if env var is missing.
 */
const CLIENT_CDN_BASE_URL =
  process.env.NEXT_PUBLIC_S3_CDN_URL || "https://s3-storage.callahan.cloud";

/**
 * Extract S3 hostname from server URL
 */
export function getS3Host(s3ServerUrl?: string): string {
  // If caller supplies a value, parse and return hostname
  if (s3ServerUrl) {
    try {
      return new URL(s3ServerUrl).hostname;
    } catch {
      // Fall through to the explicit error below
    }
  }

  /*
   * No valid server URL was provided. In this code-base we rely on DigitalOcean
   * Spaces (or another S3-compatible provider), **not** AWS S3. Returning the
   * hard-coded AWS hostname leads to confusing, broken URLs. Instead we fail
   * fast with a descriptive error so the missing configuration is detected
   * immediately during development or CI.
   */
  throw new Error(
    "[cdn-utils] S3 server URL is required but was not provided or was invalid. " +
      "Please set S3_SERVER_URL (e.g. https://sfo3.digitaloceanspaces.com) or ensure " +
      "a valid cdnBaseUrl is supplied.",
  );
}

/**
 * Build CDN URL for an S3 key
 * Prefers CDN URL if available, falls back to S3 direct URL
 */
export function buildCdnUrl(s3Key: string, config: CdnConfig): string {
  const { cdnBaseUrl, s3BucketName, s3ServerUrl } = config;

  // Prefer CDN URL if available
  if (cdnBaseUrl) {
    // Ensure no double slashes
    const cleanCdnUrl = cdnBaseUrl.endsWith("/") ? cdnBaseUrl.slice(0, -1) : cdnBaseUrl;
    const cleanKey = s3Key.startsWith("/") ? s3Key.slice(1) : s3Key;
    return `${cleanCdnUrl}/${cleanKey}`;
  }

  // Fall back to S3 direct URL
  if (!s3BucketName) {
    // Throw error in all environments when CDN configuration is missing
    // This ensures we catch configuration issues early
    throw new Error(
      `CDN configuration missing: Either cdnBaseUrl or s3BucketName must be provided. ` +
        `S3 key: ${s3Key}. ` +
        `Please ensure NEXT_PUBLIC_S3_CDN_URL is set in your environment.`,
    );
  }

  const s3Host = getS3Host(s3ServerUrl);
  return `https://${s3BucketName}.${s3Host}/${s3Key}`;
}

/**
 * Extract S3 key from CDN or S3 URL
 */
export function extractS3KeyFromUrl(url: string, config: CdnConfig): string | null {
  const { cdnBaseUrl, s3BucketName, s3ServerUrl } = config;

  try {
    const parsed = parseAbsoluteUrl(url);
    if (!parsed || !SUPPORTED_PROTOCOLS.has(parsed.protocol)) {
      return null;
    }

    // Check if it's a CDN URL
    const cdnBase = parseAbsoluteUrl(cdnBaseUrl);
    if (cdnBase && parsed.host === cdnBase.host && parsed.protocol === cdnBase.protocol) {
      const basePath = normalizeBasePath(cdnBase.pathname);
      if (basePath === "/" || parsed.pathname.startsWith(basePath)) {
        const key =
          basePath === "/" ? parsed.pathname.slice(1) : parsed.pathname.slice(basePath.length);
        return key.startsWith("/") ? key.slice(1) : key;
      }
    }

    // Check if it's an S3 URL
    if (s3BucketName && s3ServerUrl) {
      const s3Host = getS3Host(s3ServerUrl);
      const s3Base = parseAbsoluteUrl(s3ServerUrl);
      const expectedHost = s3Base?.port
        ? `${s3BucketName}.${s3Host}:${s3Base.port}`
        : `${s3BucketName}.${s3Host}`;
      if (parsed.host === expectedHost) {
        const s3Protocol = s3Base?.protocol ?? "https:";
        if (!SUPPORTED_PROTOCOLS.has(s3Protocol) || parsed.protocol !== s3Protocol) {
          return null;
        }
        return parsed.pathname.startsWith("/") ? parsed.pathname.slice(1) : parsed.pathname;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Check if URL is from our CDN or S3
 */
export function isOurCdnUrl(url: string, config: CdnConfig): boolean {
  const { cdnBaseUrl, s3BucketName, s3ServerUrl } = config;
  const parsed = parseAbsoluteUrl(url);
  if (!parsed || !SUPPORTED_PROTOCOLS.has(parsed.protocol)) {
    return false;
  }

  // Check CDN URL
  const cdnBase = parseAbsoluteUrl(cdnBaseUrl);
  if (cdnBase && parsed.host === cdnBase.host && parsed.protocol === cdnBase.protocol) {
    const basePath = normalizeBasePath(cdnBase.pathname);
    if (basePath === "/" || parsed.pathname.startsWith(basePath)) {
      return true;
    }
  }

  // Check S3 URL
  if (s3BucketName && s3ServerUrl) {
    const s3Host = getS3Host(s3ServerUrl);
    const s3Base = parseAbsoluteUrl(s3ServerUrl);
    const expectedHost = s3Base?.port
      ? `${s3BucketName}.${s3Host}:${s3Base.port}`
      : `${s3BucketName}.${s3Host}`;
    if (parsed.host !== expectedHost) {
      return false;
    }

    const s3Protocol = s3Base?.protocol ?? "https:";
    if (!SUPPORTED_PROTOCOLS.has(s3Protocol)) {
      return false;
    }

    return parsed.protocol === s3Protocol;
  }

  return false;
}

/**
 * Get CDN config from environment variables
 * Handles both server and client environments appropriately
 *
 * CRITICAL FIX (2025-11-11): Client-side components now use the module-level
 * CLIENT_CDN_BASE_URL constant captured at build time, ensuring NEXT_PUBLIC_S3_CDN_URL
 * is always available even when process.env access is unreliable in Next.js 16.
 */
export function getCdnConfigFromEnv(): CdnConfig {
  // In client-side environment, only NEXT_PUBLIC_* variables are available
  const isClient = typeof globalThis.window !== "undefined";

  if (isClient) {
    // Client-side: use the build-time captured constant for reliability
    return {
      cdnBaseUrl: CLIENT_CDN_BASE_URL,
      // These are not available client-side, but buildCdnUrl should use cdnBaseUrl when available
      s3BucketName: undefined,
      s3ServerUrl: undefined,
    };
  }

  // Server-side: all environment variables are available
  return {
    cdnBaseUrl: process.env.NEXT_PUBLIC_S3_CDN_URL || process.env.S3_CDN_URL,
    s3BucketName: process.env.S3_BUCKET,
    s3ServerUrl: process.env.S3_SERVER_URL,
  };
}

/**
 * Build a local `/api/cache/images` proxy URL for a CDN resource.
 * Mirrors the logic inside `components/ui/logo-image.client.tsx` so both
 * server and client consumers hit the exact same trusted proxy before passing
 * the response to `<Image>`.
 */
export function buildCachedImageUrl(cdnUrl: string, width?: number): string {
  const params = new URLSearchParams();
  params.set("url", cdnUrl);
  if (typeof width === "number" && width > 0) {
    params.set("width", String(width));
  }
  return `/api/cache/images?${params.toString()}`;
}
