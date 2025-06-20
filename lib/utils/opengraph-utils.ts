/**
 * OpenGraph Utilities
 *
 * This module provides a set of utility functions for handling OpenGraph data.
 * It includes functions for URL validation, normalization, hashing, and domain-specific
 * data extraction. These utilities are designed to be resilient and handle various
 * edge cases encountered when processing OpenGraph metadata from diverse sources.
 *
 * @module utils/opengraph-utils
 */

import crypto from "node:crypto";
import type { OgMetadata } from "@/types";

/**
 * Validates a URL for OpenGraph fetching.
 *
 * @param url - The URL to validate
 * @returns True if the URL is valid, false otherwise
 */
export function validateOgUrl(url: string): boolean {
  if (!url) {
    return false;
  }
  try {
    const urlObj = new URL(url);
    // Allow http and https protocols
    return ["http:", "https:"].includes(urlObj.protocol);
  } catch {
    return false;
  }
}

/**
 * Normalizes a URL for consistent caching and processing.
 *
 * @param url - The URL to normalize
 * @returns The normalized URL
 */
export function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove hash and search params for consistent caching
    urlObj.hash = "";
    urlObj.search = "";
    return urlObj.toString();
  } catch {
    return url; // Return original url if parsing fails
  }
}

/**
 * Creates a SHA256 hash of a URL for use as a cache key.
 *
 * @param url - The URL to hash
 * @returns The hashed URL
 */
export function hashUrl(url: string): string {
  return crypto.createHash("sha256").update(url).digest("hex");
}

/**
 * Hashes image content for creating unique identifiers.
 *
 * @param buffer - The image buffer to hash
 * @returns A SHA256 hash of the image content
 */
export function hashImageContent(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Constructs a deterministic S3 key for OpenGraph images
 * @param imageUrl - Image URL
 * @param s3Directory - S3 directory prefix
 * @param pageUrl - The URL of the page the image belongs to, for domain extraction
 * @param idempotencyKey - Optional idempotency key
 * @param fallbackHash - Optional fallback hash if idempotency key is not present
 * @returns Constructed S3 key
 */
export function getOgImageS3Key(
  imageUrl: string,
  s3Directory: string,
  pageUrl: string | undefined,
  idempotencyKey?: string,
  fallbackHash?: string,
): string {
  const extension = getImageExtension(imageUrl);
  let baseKey: string;

  if (idempotencyKey && pageUrl) {
    try {
      const domain = new URL(pageUrl).hostname.replace(/^www\./, "");
      const sanitizedDomain = domain.replace(/\./g, "-");
      baseKey = `${sanitizedDomain}-${idempotencyKey}`;
    } catch {
      // Fallback if pageUrl is invalid
      baseKey = idempotencyKey;
    }
  } else if (idempotencyKey) {
    // Fallback if pageUrl is not provided for some reason
    baseKey = idempotencyKey;
  } else if (fallbackHash) {
    baseKey = fallbackHash;
  } else {
    baseKey = hashImageContent(Buffer.from(imageUrl));
  }

  return `${s3Directory}/${baseKey}.${extension}`;
}

/**
 * Sanitizes OpenGraph metadata fields.
 *
 * @param metadata - The raw metadata object
 * @returns The sanitized metadata object
 */
export function sanitizeOgMetadata(metadata: Record<string, unknown>): OgMetadata {
  const sanitized: Record<string, string> = {};
  for (const key in metadata) {
    if (Object.hasOwn(metadata, key)) {
      const value = metadata[key];
      if (typeof value === "string") {
        sanitized[key] = value.trim();
      } else if (typeof value === "number" || typeof value === "boolean") {
        sanitized[key] = String(value);
      }
    }
  }
  return sanitized;
}

/**
 * Extracts the file extension from an image URL.
 *
 * @param url - The image URL
 * @returns The file extension, or 'png' as a default
 */
export function getImageExtension(url: string): string {
  if (!url) return "png";
  try {
    const pathName = new URL(url).pathname;
    // Remove leading/trailing slashes and dots for safety
    const cleanPath = pathName.replace(/^[./]+|[./]+$/g, "");
    const parts = cleanPath.split(".");

    if (parts.length > 1) {
      const extension = parts.pop()?.toLowerCase();
      // Ensure it's a plausible image extension
      if (extension && ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(extension)) {
        return extension;
      }
    }
  } catch {
    // Fallback for invalid URLs remains the same
    const extension = url.split(".").pop()?.split("?")[0]?.toLowerCase();
    if (extension && ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(extension)) {
      return extension;
    }
  }
  // Default to png if no valid extension is found
  return "png";
}

/**
 * Gets the domain type from a URL for platform-specific logic.
 *
 * @param url - The URL to analyze
 * @returns The domain type (e.g., 'GitHub', 'X', 'LinkedIn', 'Website')
 */
export function getDomainType(url: string): string {
  if (!url) return "Website";
  try {
    const domain = new URL(url).hostname;
    if (domain.includes("github.com")) return "GitHub";
    if (domain.includes("x.com") || domain.includes("twitter.com")) return "X";
    if (domain.includes("linkedin.com")) return "LinkedIn";
    if (domain.includes("bsky.app")) return "Bluesky";
    return "Website";
  } catch {
    return "Website";
  }
}

/**
 * Determines if a failed URL fetch should be retried based on the error.
 *
 * @param error - The error object from a fetch attempt
 * @returns True if the request should be retried, false otherwise
 */
export function shouldRetryUrl(error: Error): boolean {
  if (!error?.message) {
    return true; // Retry on unknown errors
  }
  const msg = error.message.toLowerCase();
  const nonRetryableErrors = [
    "400", // Bad Request
    "401", // Unauthorized
    "403", // Forbidden
    "404", // Not Found
    "invalid",
    "unsafe",
    "content too large",
  ];
  return !nonRetryableErrors.some((errText) => msg.includes(errText));
}

/**
 * Calculates exponential backoff delay for retries.
 *
 * @param attempt - The current retry attempt number (0-indexed)
 * @param base - The base delay in milliseconds
 * @param max - The maximum backoff delay
 * @returns The calculated delay in milliseconds
 */
export function calculateBackoffDelay(attempt: number, base: number, max: number): number {
  return Math.min(base * 2 ** attempt, max);
}

/**
 * Checks if an image URL is valid and not a data URI.
 *
 * @param url - The image URL to check
 * @returns True if the URL is valid, false otherwise
 */
export function isValidImageUrl(url: string | null | undefined): url is string {
  return !!url && !url.startsWith("data:");
}

/**
 * Constructs a Karakeep asset URL for consistent proxy usage
 *
 * @param assetId - The Karakeep asset ID
 * @param _baseUrl - The base URL for the Karakeep API (unused, kept for API compatibility)
 * @returns Constructed asset URL for proxy access
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function constructKarakeepAssetUrl(assetId: string, _baseUrl?: string): string {
  // Validate asset ID format (should be non-empty string, potentially UUID)
  if (!assetId || typeof assetId !== "string" || assetId.trim().length === 0) {
    throw new Error("Invalid asset ID provided");
  }

  // Sanitize asset ID to prevent path traversal
  const sanitizedAssetId = assetId.replace(/[^a-zA-Z0-9\-_]/g, "");
  if (sanitizedAssetId !== assetId) {
    throw new Error("Asset ID contains invalid characters");
  }

  // Use local asset proxy endpoint for consistent authentication and error handling
  // This ensures we go through our own asset proxy which handles Karakeep authentication
  return `/api/assets/${sanitizedAssetId}`;
}
