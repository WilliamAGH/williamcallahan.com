/**
 * OpenGraph Utility Functions
 * @module lib/utils/opengraph-utils
 * @description
 * Utility functions for OpenGraph data processing, URL validation, and security.
 * Provides SSRF protection, URL normalization, and metadata sanitization.
 */

import crypto from 'node:crypto';
import type { OgMetadata } from '@/types';

/**
 * Creates a hash for a URL to use as a cache key
 * @param url - URL to hash
 * @returns SHA-256 hash of the URL
 */
export function hashUrl(url: string): string {
  return crypto.createHash('sha256').update(url.toLowerCase().trim()).digest('hex');
}

/**
 * Creates a hash for image content to use as a cache key
 * @param buffer - Image buffer to hash
 * @returns SHA-256 hash of the image content
 */
export function hashImageContent(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Validates and sanitizes a URL for OpenGraph fetching
 * Provides SSRF protection and URL normalization
 * @param url - URL to validate
 * @returns True if URL is safe to fetch
 */
export function validateOgUrl(url: string): boolean {
  console.log(`[DEBUG] Validating OpenGraph URL: ${url}`);
  try {
    const parsedUrl = new URL(url);
    
    // Protocol validation - only allow HTTP/HTTPS
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      console.log(`[DEBUG] URL rejected - invalid protocol: ${parsedUrl.protocol}`);
      return false;
    }
    
    const hostname = parsedUrl.hostname.toLowerCase();
    
    // SSRF protection - reject local/private IPs and localhost
    if (/^(localhost|127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(hostname)) {
      console.log(`[DEBUG] URL rejected - private/local IP: ${hostname}`);
      return false;
    }
    
    // Reject obviously malicious hostname patterns
    if (hostname.includes('..') || hostname.startsWith('.') || hostname.length < 3) {
      console.log(`[DEBUG] URL rejected - malicious hostname pattern: ${hostname}`);
      return false;
    }
    
    // Reject non-standard ports that might indicate local services (except common dev ports)
    if (parsedUrl.port && !['80', '443', '8080', '8443', '3000', '3001', '4000', '5000'].includes(parsedUrl.port)) {
      console.log(`[DEBUG] URL rejected - suspicious port: ${parsedUrl.port}`);
      return false;
    }
    
    // Ensure hostname has at least one dot (basic domain validation)
    if (!hostname.includes('.') && hostname !== 'localhost') {
      console.log(`[DEBUG] URL rejected - invalid domain format: ${hostname}`);
      return false;
    }
    
    console.log(`[DEBUG] URL validated successfully: ${hostname}`);
    return true;
  } catch (error) {
    console.log(`[DEBUG] URL validation failed - invalid URL: ${String(error)}`);
    return false;
  }
}

/**
 * Normalizes a URL for consistent caching
 * @param url - URL to normalize
 * @returns Normalized URL string
 */
export function normalizeUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    
    // Remove common tracking parameters
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'source'];
    for (const param of trackingParams) {
      parsedUrl.searchParams.delete(param);
    }
    
    // Normalize hostname (remove www.)
    if (parsedUrl.hostname.startsWith('www.')) {
      parsedUrl.hostname = parsedUrl.hostname.substring(4);
    }
    
    // Ensure consistent protocol
    if (parsedUrl.protocol === 'http:' && parsedUrl.hostname !== 'localhost') {
      parsedUrl.protocol = 'https:';
    }
    
    // Remove trailing slash for consistency
    if (parsedUrl.pathname.endsWith('/') && parsedUrl.pathname.length > 1) {
      parsedUrl.pathname = parsedUrl.pathname.slice(0, -1);
    }
    
    return parsedUrl.toString();
  } catch {
    return url; // Return original if parsing fails
  }
}

/**
 * Sanitizes OpenGraph metadata to prevent XSS and ensure data quality
 * @param metadata - Raw metadata object
 * @returns Sanitized metadata
 */
export function sanitizeOgMetadata(metadata: unknown): OgMetadata {
  if (!metadata || typeof metadata !== 'object') {
    return {};
  }
  
  const metadataRecord = metadata as Record<string, unknown>;
  const sanitized: OgMetadata = {};
  
  // Helper function to sanitize string values
  const sanitizeString = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    
    // Basic XSS prevention - remove script tags and javascript: protocols
    const cleaned = value
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim();
    
    return cleaned.length > 0 && cleaned.length <= 1000 ? cleaned : null;
  };
  
  // Helper function to sanitize URL values
  const sanitizeUrl = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    
    try {
      const url = new URL(value);
      if (['http:', 'https:'].includes(url.protocol)) {
        return url.toString();
      }
    } catch {
      // If not a valid URL, treat as relative path
      if (value.startsWith('/') && !value.includes('..')) {
        return value;
      }
    }
    
    return null;
  };
  
  // Sanitize each field
  sanitized.title = sanitizeString(metadataRecord.title);
  sanitized.description = sanitizeString(metadataRecord.description);
  sanitized.site = sanitizeString(metadataRecord.site);
  sanitized.siteName = sanitizeString(metadataRecord.siteName);
  sanitized.type = sanitizeString(metadataRecord.type);
  sanitized.url = sanitizeUrl(metadataRecord.url);
  
  // Image URLs need special handling
  sanitized.image = sanitizeUrl(metadataRecord.image);
  sanitized.twitterImage = sanitizeUrl(metadataRecord.twitterImage);
  sanitized.profileImage = sanitizeUrl(metadataRecord.profileImage);
  sanitized.bannerImage = sanitizeUrl(metadataRecord.bannerImage);
  
  return sanitized;
}

/**
 * Determines the domain type from a URL for specialized handling
 * @param url - URL to analyze
 * @returns Domain type string
 */
export function getDomainType(url: string): string {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    
    if (hostname.includes('github.com')) return 'GitHub';
    if (hostname.includes('x.com')) return 'X';
    if (hostname.includes('twitter.com')) return 'Twitter';
    if (hostname.includes('linkedin.com')) return 'LinkedIn';
    if (hostname.includes('discord.com')) return 'Discord';
    if (hostname.includes('bsky.app')) return 'Bluesky';
    
    return hostname;
  } catch {
    return 'unknown';
  }
}

/**
 * Checks if a URL should be retried based on the error type
 * @param error - Error that occurred during fetch
 * @returns True if the URL should be retried
 */
export function shouldRetryUrl(error: Error): boolean {
  const retryableErrors = [
    'ECONNRESET',
    'ENOTFOUND',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'NETWORK_ERROR',
    'FETCH_ERROR'
  ];
  
  const errorMessage = error.message.toLowerCase();
  
  return retryableErrors.some(retryableError => 
    errorMessage.includes(retryableError.toLowerCase())
  );
}

/**
 * Calculates the delay for exponential backoff
 * @param attempt - Current attempt number (0-based)
 * @param baseDelay - Base delay in milliseconds
 * @param maxDelay - Maximum delay in milliseconds
 * @returns Delay in milliseconds
 */
export function calculateBackoffDelay(attempt: number, baseDelay: number, maxDelay: number): number {
  const delay = baseDelay * (2 ** attempt);
  return Math.min(delay, maxDelay);
}

/**
 * Extracts the file extension from an image URL
 * @param imageUrl - Image URL
 * @returns File extension (without dot) or 'jpg' as default
 */
export function getImageExtension(imageUrl: string): string {
  try {
    const url = new URL(imageUrl);
    const pathname = url.pathname.toLowerCase();
    const match = pathname.match(/\.([a-z0-9]+)$/);
    
    if (match) {
      const ext = match[1];
      // Map common extensions
      if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico'].includes(ext)) {
        return ext === 'jpg' ? 'jpeg' : ext;
      }
    }
    
    // Default to jpeg for unknown extensions
    return 'jpeg';
  } catch {
    return 'jpeg';
  }
}

/**
 * Checks if an image URL is likely to be a valid image
 * @param imageUrl - Image URL to validate
 * @returns True if URL appears to be a valid image
 */
export function isValidImageUrl(imageUrl: string): boolean {
  if (!imageUrl || typeof imageUrl !== 'string') {
    return false;
  }
  
  try {
    const url = new URL(imageUrl);
    
    // Check protocol
    if (!['http:', 'https:'].includes(url.protocol)) {
      return false;
    }
    
    // Check for common image patterns
    const pathname = url.pathname.toLowerCase();
    const hasImageExtension = /\.(jpg|jpeg|png|gif|webp|svg|ico)(\?|$)/.test(pathname);
    const hasImagePath = pathname.includes('/image') || pathname.includes('/avatar') || pathname.includes('/logo');
    
    return hasImageExtension || hasImagePath;
  } catch {
    return false;
  }
}
