/**
 * CDN URL Builder Utilities
 *
 * Consistent CDN URL generation across services
 * Handles both CDN and S3 direct URLs
 */

import type { CdnConfig } from "@/types/s3-cdn";

const SUPPORTED_PROTOCOLS = new Set(["http:", "https:"]);

/** Path for the image proxy API route - single source of truth */
const IMAGE_PROXY_PATH = "/api/cache/images";

/** Path for the asset proxy API route (Karakeep/Hoarder images) */
const ASSET_PROXY_PATH = "/api/assets/";

/**
 * Get S3 CDN base URL from the canonical environment variable.
 *
 * Uses NEXT_PUBLIC_S3_CDN_URL exclusively (the sole canonical CDN env var).
 *
 * @throws {Error} if NEXT_PUBLIC_S3_CDN_URL is not configured
 * @see {@link getCdnConfigFromEnv} for full configuration object
 */
export function getS3CdnUrl(): string {
  const cdnUrl = process.env.NEXT_PUBLIC_S3_CDN_URL;
  if (!cdnUrl) {
    throw new Error("[cdn-utils] NEXT_PUBLIC_S3_CDN_URL is required but was not provided.");
  }
  return cdnUrl;
}

/**
 * Parse a string as an absolute URL.
 * Returns null for empty/undefined values or malformed URLs.
 * This is intentionally silent - callers use null to indicate "no valid URL".
 */
function parseAbsoluteUrl(value?: string): URL | null {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    // Malformed URLs are expected (e.g., relative paths, invalid input)
    // Callers handle null appropriately - no logging needed
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
const CLIENT_CDN_BASE_URL = process.env.NEXT_PUBLIC_S3_CDN_URL;

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
  const cdnBaseUrl = process.env.NEXT_PUBLIC_S3_CDN_URL;
  if (!cdnBaseUrl) {
    throw new Error("[cdn-utils] NEXT_PUBLIC_S3_CDN_URL is required but was not provided.");
  }

  if (isClient) {
    // Client-side: use the build-time captured constant for reliability
    // Validate CLIENT_CDN_BASE_URL explicitly to avoid silent null state
    const clientCdnUrl = CLIENT_CDN_BASE_URL ?? cdnBaseUrl;
    if (!clientCdnUrl) {
      throw new Error(
        "[cdn-utils] CLIENT_CDN_BASE_URL and cdnBaseUrl are both null. " +
          "NEXT_PUBLIC_S3_CDN_URL must be set at build time.",
      );
    }
    return {
      cdnBaseUrl: clientCdnUrl,
      // These are not available client-side, but buildCdnUrl should use cdnBaseUrl when available
      s3BucketName: undefined,
      s3ServerUrl: undefined,
    };
  }

  // Server-side: all environment variables are available
  return {
    cdnBaseUrl,
    s3BucketName: process.env.S3_BUCKET,
    s3ServerUrl: process.env.S3_SERVER_URL,
  };
}

/**
 * Build an image proxy URL for the image cache API.
 * Single source of truth for proxy URL construction.
 */
function buildImageProxyUrl(url: string, width?: number): string {
  const params = new URLSearchParams();
  params.set("url", url);
  if (typeof width === "number" && width > 0) {
    params.set("width", String(width));
  }
  return `${IMAGE_PROXY_PATH}?${params.toString()}`;
}

/**
 * Build a local `/api/cache/images` proxy URL for a CDN resource.
 * Mirrors the logic inside `components/ui/logo-image.client.tsx` so both
 * server and client consumers hit the exact same trusted proxy before passing
 * the response to `<Image>`.
 *
 * **WARNING:** Only use for external URLs that need SSRF protection.
 * NEVER use for our CDN URLs - that bypasses Next.js optimization.
 * Use `getOptimizedImageSrc()` instead which routes correctly.
 *
 * @see docs/architecture/image-handling.md (Image Optimization Decision Matrix)
 */
export function buildCachedImageUrl(cdnUrl: string, width?: number): string {
  return buildImageProxyUrl(cdnUrl, width);
}

/**
 * Returns the appropriate image src for <Image> component.
 * - CDN URLs: return directly (let Next.js optimize via /_next/image)
 * - External URLs: proxy through /api/cache/images for SSRF protection
 *
 * CANONICAL: See docs/standards/nextjs-framework.md#4
 *
 * @example
 * // CDN URL → returns directly for Next.js optimization
 * getOptimizedImageSrc("https://s3-storage.callahan.cloud/images/foo.jpg")
 * // Returns: "https://s3-storage.callahan.cloud/images/foo.jpg"
 *
 * @example
 * // External URL → proxied for SSRF protection
 * getOptimizedImageSrc("https://pbs.twimg.com/profile_images/123.jpg")
 * // Returns: "/api/cache/images?url=https%3A%2F%2Fpbs.twimg.com%2F..."
 */
export function getOptimizedImageSrc(
  src: string | null | undefined,
  config?: CdnConfig,
  width?: number,
): string | undefined {
  if (!src) return undefined;

  // Local paths and data URLs pass through unchanged
  if (src.startsWith("/") || src.startsWith("data:")) {
    return src;
  }

  // Prevent double-proxying: check for relative proxy paths without leading slash
  // (e.g., "api/cache/images?url=..." passed by mistake)
  if (src.startsWith(IMAGE_PROXY_PATH.slice(1)) || src.startsWith(ASSET_PROXY_PATH.slice(1))) {
    // Normalize to absolute path and return
    return `/${src}`;
  }

  // Our CDN URLs: use directly (Next.js optimizer handles them)
  if (isOurCdnUrl(src, config ?? getCdnConfigFromEnv())) {
    return src;
  }

  // Avoid double-proxying: URLs already pointing to our image proxy pass through
  // This catches absolute URLs like https://williamcallahan.com/api/cache/images?url=...
  try {
    const parsed = new URL(src);
    if (parsed.pathname === IMAGE_PROXY_PATH) {
      // Already proxied - return unchanged to prevent infinite proxy loop
      return src;
    }
  } catch {
    // Not a valid absolute URL - fall through to proxy
  }

  // External URLs: proxy for SSRF protection
  return buildImageProxyUrl(src, width);
}

/**
 * Whether to use `unoptimized` prop on <Image>.
 * True for API routes that serve already-processed images, or data URIs.
 *
 * CANONICAL: See docs/standards/nextjs-framework.md#4
 *
 * @example
 * <Image
 *   src={imageUrl}
 *   {...(shouldBypassOptimizer(imageUrl) ? { unoptimized: true } : {})}
 * />
 */
export function shouldBypassOptimizer(src: string | undefined): boolean {
  if (!src) return false;
  return (
    src.startsWith(IMAGE_PROXY_PATH) || src.startsWith(ASSET_PROXY_PATH) || src.startsWith("data:")
  );
}
