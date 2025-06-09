/**
 * API Response Sanitization Utilities
 * @module lib/utils/api-sanitization
 * @description
 * Utilities for sanitizing API responses to prevent sensitive data exposure
 * such as file paths, internal system information, and debug details.
 */

import type { BlogPost } from '@/types/blog';

/**
 * Sanitizes a BlogPost object for public API consumption
 * Removes sensitive fields like filePath and rawContent
 */
export function sanitizeBlogPost(post: BlogPost): Omit<BlogPost, 'filePath' | 'rawContent'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { filePath, rawContent, ...sanitizedPost } = post;
  return sanitizedPost;
}

/**
 * Sanitizes an array of BlogPost objects for public API consumption
 */
export function sanitizeBlogPosts(posts: BlogPost[]): Omit<BlogPost, 'filePath' | 'rawContent'>[] {
  return posts.map(sanitizeBlogPost);
}

/**
 * Removes sensitive information from error objects
 * Prevents stack traces and system info from leaking in production
 */
export function sanitizeError(error: unknown, includeStack = false): Record<string, unknown> {
  const isDev = process.env.NODE_ENV === 'development';
  
  const sanitized: Record<string, unknown> = {
    message: error instanceof Error ? error.message : 'An unknown error occurred',
    timestamp: new Date().toISOString()
  };

  // Only include stack traces in development or when explicitly requested
  if ((isDev || includeStack) && error instanceof Error) {
    sanitized.stack = error.stack;
  }

  return sanitized;
}

/**
 * Removes system paths and sensitive environment info from objects
 */
export function sanitizeSystemInfo(obj: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...obj };
  
  // Remove common sensitive keys
  const sensitiveKeys = [
    'path', 'filePath', 'directory', 'cwd', 'home', 'tmpdir',
    'password', 'secret', 'token', 'key', 'auth',
    'stack', 'stackTrace'
  ];
  
  for (const key of sensitiveKeys) {
    if (key in sanitized) {
      delete sanitized[key];
    }
  }
  
  // Recursively sanitize nested objects
  for (const [key, value] of Object.entries(sanitized)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeSystemInfo(value as Record<string, unknown>);
    }
  }
  
  return sanitized;
}

/**
 * Sanitizes URLs to prevent exposure of internal endpoints
 */
export function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    
    // Remove sensitive query parameters
    const sensitiveParams = ['token', 'secret', 'key', 'auth', 'password'];
    for (const param of sensitiveParams) {
      parsed.searchParams.delete(param);
    }
    
    return parsed.toString();
  } catch {
    // If URL parsing fails, return a generic message
    return '[URL sanitized]';
  }
}
