/**
 * API Response Sanitization Utilities
 * @module lib/utils/api-sanitization
 * @description
 * Utilities for sanitizing API responses to prevent sensitive data exposure
 * such as file paths, internal system information, and debug details.
 */

import type { BlogPost } from "@/types/blog";

/**
 * Sanitizes a BlogPost object for public API consumption
 * Removes sensitive fields like filePath and rawContent
 */
export function sanitizeBlogPost(post: BlogPost): Omit<BlogPost, "filePath" | "rawContent"> {
  const { filePath: removedFilePath, rawContent: removedRawContent, ...sanitizedPost } = post;
  // Explicitly acknowledge removed sensitive fields
  void removedFilePath;
  void removedRawContent;
  return sanitizedPost;
}

/**
 * Sanitizes an array of BlogPost objects for public API consumption
 */
export function sanitizeBlogPosts(posts: BlogPost[]): Omit<BlogPost, "filePath" | "rawContent">[] {
  return posts.map(sanitizeBlogPost);
}

/**
 * Removes sensitive information from error objects
 * Prevents stack traces and system info from leaking in production
 */
export function sanitizeError(error: unknown, includeStack = false): Record<string, unknown> {
  const isDev = process.env.NODE_ENV === "development";

  const sanitized: Record<string, unknown> = {
    message: error instanceof Error ? error.message : "An unknown error occurred",
    timestamp: new Date().toISOString(),
  };

  // Only include stack traces in development or when explicitly requested
  if ((isDev || includeStack) && error instanceof Error) {
    sanitized.stack = error.stack;
  }

  return sanitized;
}

/**
 * Removes system paths and sensitive environment info from objects
 * Handles circular references to prevent infinite recursion
 */
export function sanitizeSystemInfo(obj: Record<string, unknown>): Record<string, unknown> {
  // Use WeakSet to track visited objects and prevent circular references
  const visited = new WeakSet<object>();

  // Use Set for O(1) lookups and lowercase for case-insensitive matching
  const sensitiveKeys = new Set([
    "path",
    "filepath",
    "directory",
    "cwd",
    "home",
    "tmpdir",
    "password",
    "secret",
    "token",
    "key",
    "auth",
    "stack",
    "stacktrace",
  ]);

  function sanitizeRecursive(target: Record<string, unknown>): Record<string, unknown> {
    // Check for circular reference
    if (visited.has(target)) {
      return { "[Circular Reference]": true };
    }

    // Mark this object as visited
    visited.add(target);

    const sanitized = { ...target };

    // Remove common sensitive keys (case-insensitive)
    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.has(key.toLowerCase())) {
        delete sanitized[key];
      }
    }

    // Recursively sanitize nested objects
    for (const [key, value] of Object.entries(sanitized)) {
      if (value === null || value === undefined) {
        // Keep null/undefined as-is
        continue;
      }

      if (Array.isArray(value)) {
        // Handle arrays by recursively sanitizing each element
        const sanitizedArray: unknown[] = value.map((item: unknown) => {
          if (typeof item === "object" && item !== null && !Array.isArray(item)) {
            return sanitizeRecursive(item as Record<string, unknown>);
          }
          // Check if string looks like a URL and sanitize it
          if (
            typeof item === "string" &&
            (item.startsWith("http://") || item.startsWith("https://"))
          ) {
            return sanitizeUrl(item);
          }
          return item;
        });
        sanitized[key] = sanitizedArray;
      } else if (typeof value === "object" && !Array.isArray(value)) {
        // Handle nested objects
        sanitized[key] = sanitizeRecursive(value as Record<string, unknown>);
      } else if (
        typeof value === "string" &&
        (value.startsWith("http://") || value.startsWith("https://"))
      ) {
        // Sanitize URL strings to remove credentials
        sanitized[key] = sanitizeUrl(value);
      }
      // Other primitive values (number, boolean) are kept as-is
    }

    return sanitized;
  }

  return sanitizeRecursive(obj);
}

/**
 * Sanitizes URLs to prevent exposure of internal endpoints
 */
export function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);

    // Remove basic auth credentials
    parsed.username = "";
    parsed.password = "";

    // Remove sensitive query parameters
    const sensitiveParams = ["token", "secret", "key", "auth", "password"];
    for (const param of sensitiveParams) {
      parsed.searchParams.delete(param);
    }

    return parsed.toString();
  } catch {
    // If URL parsing fails, return a generic message
    return "[URL sanitized]";
  }
}
