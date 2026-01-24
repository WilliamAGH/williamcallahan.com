/**
 * Content Type Detection Utilities
 *
 * Shared utilities for detecting and inferring content types
 * Used across image services, S3 operations, and HTTP responses
 */

import { normalizeString } from "@/lib/utils";

/**
 * Image MIME type mapping
 */
export const IMAGE_MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  bmp: "image/bmp",
  tiff: "image/tiff",
  tif: "image/tiff",
  avif: "image/avif",
} as const;

/**
 * Maps content-type headers to file extensions
 * More comprehensive than IMAGE_MIME_TYPES for reverse lookups
 */
const CONTENT_TYPE_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/tiff": "tiff",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "application/octet-stream": "bin",
};

/**
 * Detect image content type from buffer contents
 * Checks for SVG by looking for <svg tag, otherwise defaults to PNG
 */
export function detectImageContentType(buffer: Buffer): string {
  // Check first 1KB for SVG signature
  const sample = buffer.toString("utf-8", 0, Math.min(1024, buffer.length)).trim();
  if (sample.includes("<svg")) {
    return "image/svg+xml";
  }

  // Check for other common image signatures
  if (buffer.length >= 8) {
    const header = buffer.toString("hex", 0, 8).toUpperCase();

    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    if (header.startsWith("89504E47")) return "image/png";

    // JPEG signatures: FF D8 FF
    if (header.startsWith("FFD8FF")) return "image/jpeg";

    // GIF signatures: GIF87a or GIF89a
    if (header.startsWith("47494638")) return "image/gif";

    // WebP signature: RIFF....WEBP
    if (buffer.length >= 12) {
      const riff = buffer.toString("ascii", 0, 4);
      const webp = buffer.toString("ascii", 8, 12);
      if (riff === "RIFF" && webp === "WEBP") return "image/webp";
    }
  }

  // Default to PNG if unable to detect
  return "image/png";
}

/**
 * Infer content type from URL
 * Extracts extension and maps to MIME type
 */
export function inferContentTypeFromUrl(url: string): string {
  try {
    // Remove query parameters and hash
    const cleanUrl = url.split("?")[0]?.split("#")[0];
    const extension = cleanUrl?.split(".").pop()?.toLowerCase();

    if (extension && IMAGE_MIME_TYPES[extension]) {
      return IMAGE_MIME_TYPES[extension];
    }
  } catch {
    // Ignore URL parsing errors
  }

  return "image/png"; // Default
}

/**
 * Infer content type from file extension
 */
export function inferContentTypeFromExtension(extension: string): string {
  const ext = extension.toLowerCase().replace(/^\./, "");
  return IMAGE_MIME_TYPES[ext] || "application/octet-stream";
}

/**
 * Get file extension from content type
 * @param contentType The content-type header value (can be null)
 * @returns The file extension without dot (e.g., 'jpg')
 */
export function getExtensionFromContentType(contentType: string | null): string {
  if (!contentType) return "jpg"; // Default fallback

  // Extract the base content type (remove charset and other parameters)
  const baseType = normalizeString(contentType.split(";")[0] ?? "");

  // Use the comprehensive mapping
  return CONTENT_TYPE_TO_EXTENSION[baseType] || "jpg";
}

/**
 * Get content type from file extension
 * @param extension The file extension (with or without dot)
 * @returns The content type string
 */
export function getContentTypeFromExtension(extension: string): string {
  // Normalize extension (remove dot if present)
  const ext = extension.startsWith(".") ? extension.slice(1).toLowerCase() : extension.toLowerCase();

  // Use IMAGE_MIME_TYPES mapping
  return IMAGE_MIME_TYPES[ext] || "application/octet-stream";
}

/**
 * Check if content type is an image
 */
export function isImageContentType(contentType: string): boolean {
  return contentType.toLowerCase().startsWith("image/");
}

/**
 * Normalize content type (remove parameters, lowercase)
 */
export function normalizeContentType(contentType: string): string {
  return normalizeString(contentType.split(";")[0] ?? "");
}

/**
 * Read-only array of supported image file extensions (lower-case, no dot)
 * Derived automatically from IMAGE_MIME_TYPES so there is a single source of truth.
 */
export const IMAGE_EXTENSIONS: readonly string[] = Object.keys(IMAGE_MIME_TYPES) as readonly string[];

/**
 * Guess the MIME type for an image based on a response header value and/or the URL path.
 * Falls back to sensible defaults, never returns application/octet-stream.
 */
export function guessImageContentType(url: string, header?: string | null): string {
  const normalized = header?.toLowerCase();

  if (normalized && normalized !== "application/octet-stream") {
    return normalized;
  }

  const lowerUrl = url.toLowerCase();
  if (lowerUrl.endsWith(".png")) return "image/png";
  if (lowerUrl.endsWith(".jpg") || lowerUrl.endsWith(".jpeg")) return "image/jpeg";
  if (lowerUrl.endsWith(".gif")) return "image/gif";
  if (lowerUrl.endsWith(".webp")) return "image/webp";
  if (lowerUrl.endsWith(".svg")) return "image/svg+xml";
  if (lowerUrl.endsWith(".ico")) return "image/x-icon";

  return "image/png"; // safe default
}
