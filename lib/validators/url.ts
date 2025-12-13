/**
 * URL Validation Functions
 *
 * Provides validation functions that use the centralized Zod schemas
 * from the type system to prevent SSRF attacks and ensure security.
 */

import { logoUrlSchema, openGraphUrlSchema, s3KeySchema, safePathSchema } from "@/types/schemas/url";

/**
 * Validate URL for logo fetching
 */
export async function validateLogoUrl(url: string): Promise<{
  success: boolean;
  data?: string;
  error?: string;
}> {
  const result = await logoUrlSchema.safeParseAsync(url);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    error: result.error.issues[0]?.message || "Invalid URL",
  };
}

/**
 * Validate URL for OpenGraph fetching
 */
export async function validateOpenGraphUrl(url: string): Promise<{
  success: boolean;
  data?: string;
  error?: string;
}> {
  const result = await openGraphUrlSchema.safeParseAsync(url);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    error: result.error.issues[0]?.message || "Invalid URL",
  };
}

/**
 * Validate S3 key
 */
export function validateS3Key(key: string): boolean {
  return s3KeySchema.safeParse(key).success;
}

/**
 * Sanitize a file path
 */
export function sanitizePath(path: string): string {
  return safePathSchema.parse(path);
}

/**
 * Rate limit windows for image endpoints
 */
export const IMAGE_RATE_LIMITS = {
  // Per IP limits
  perIp: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30,
  },
  // Per domain limits (for logo fetching)
  perDomain: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,
  },
} as const;

/**
 * Security headers for image responses
 */
export const IMAGE_SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Content-Security-Policy": "default-src 'none'; img-src 'self' data: https:; style-src 'unsafe-inline'",
} as const;
