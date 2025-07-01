/**
 * CDN URL Builder Utilities
 *
 * Consistent CDN URL generation across services
 * Handles both CDN and S3 direct URLs
 */

import type { CdnConfig } from "@/types/s3-cdn";

/**
 * Extract S3 hostname from server URL
 */
export function getS3Host(s3ServerUrl?: string): string {
  if (!s3ServerUrl) return "s3.amazonaws.com";

  try {
    const url = new URL(s3ServerUrl);
    return url.hostname;
  } catch {
    return "s3.amazonaws.com";
  }
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
    // In client-side environment, if neither CDN URL nor bucket is available,
    // return a relative path as a fallback to avoid breaking the entire page
    if (typeof globalThis.window !== 'undefined') {
      console.warn(`CDN configuration missing for S3 key: ${s3Key}. Using relative path as fallback.`);
      return `/${s3Key}`;
    }
    throw new Error("Either cdnBaseUrl or s3BucketName must be provided");
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
    // Check if it's a CDN URL
    if (cdnBaseUrl && url.startsWith(cdnBaseUrl)) {
      const key = url.slice(cdnBaseUrl.length);
      return key.startsWith("/") ? key.slice(1) : key;
    }

    // Check if it's an S3 URL
    if (s3BucketName) {
      const s3Host = getS3Host(s3ServerUrl);
      const s3UrlPrefix = `https://${s3BucketName}.${s3Host}/`;

      if (url.startsWith(s3UrlPrefix)) {
        return url.slice(s3UrlPrefix.length);
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

  // Check CDN URL
  if (cdnBaseUrl && url.startsWith(cdnBaseUrl)) {
    return true;
  }

  // Check S3 URL
  if (s3BucketName) {
    const s3Host = getS3Host(s3ServerUrl);
    const s3UrlPrefix = `https://${s3BucketName}.${s3Host}/`;
    return url.startsWith(s3UrlPrefix);
  }

  return false;
}

/**
 * Get CDN config from environment variables
 * Handles both server and client environments appropriately
 */
export function getCdnConfigFromEnv(): CdnConfig {
  // In client-side environment, only NEXT_PUBLIC_* variables are available
  const isClient = typeof globalThis.window !== 'undefined';
  
  if (isClient) {
    // Client-side: only NEXT_PUBLIC_S3_CDN_URL is available
    return {
      cdnBaseUrl: process.env.NEXT_PUBLIC_S3_CDN_URL,
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
