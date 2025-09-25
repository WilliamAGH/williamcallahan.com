/**
 * Shared HTTP Client Utilities
 *
 * Consolidated fetch utilities with unified retry, timeout, and error handling
 * Supports domain-specific requirements while maintaining a consistent API
 */

import { debugLog } from "./debug";
import { retryWithOptions, RETRY_CONFIGS } from "./retry";
import { isRetryableError } from "./error-utils";
import type { RetryConfig } from "@/types/lib";
import type { FetchOptions } from "@/types/http";
import { logoUrlSchema, openGraphUrlSchema } from "@/types/schemas/url";

/**
 * Default browser-like headers for image fetching
 */
export const DEFAULT_IMAGE_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; ImageFetcher/1.0)",
  Accept: "image/webp,image/apng,image/*,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
} as const;

/**
 * Browser-like headers for general web fetching
 */
export const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
} as const;

/**
 * Fetch with timeout and proper error handling
 * Supports proxy URLs, 202 status handling, and browser-like headers
 */
export async function fetchWithTimeout(url: string, options: FetchOptions = {}): Promise<Response> {
  const {
    timeout = 10000,
    userAgent,
    headers = {},
    proxyUrl,
    handle202Retry = false,
    useBrowserHeaders = false,
    ...fetchOptions
  } = options;

  // Apply proxy if specified
  let effectiveUrl = url;
  if (proxyUrl) {
    const originalUrl = new URL(url);
    const proxyUrlObj = new URL(proxyUrl);
    proxyUrlObj.pathname = originalUrl.pathname;
    proxyUrlObj.search = originalUrl.search;
    effectiveUrl = proxyUrlObj.toString();
    debugLog(`Using proxy: ${url} -> ${effectiveUrl}`, "info");
  }

  // Choose appropriate default headers
  const defaultHeaders = useBrowserHeaders ? BROWSER_HEADERS : DEFAULT_IMAGE_HEADERS;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(effectiveUrl, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        ...defaultHeaders,
        ...(userAgent && { "User-Agent": userAgent }),
        ...headers,
      },
    });

    // Handle 202 Accepted status if requested (GitHub API pattern)
    if (handle202Retry && response.status === 202) {
      clearTimeout(timeoutId);

      const retryAfter = response.headers.get("Retry-After");
      const retryDelay = retryAfter ? parseInt(retryAfter, 10) * 1000 : 5000;

      debugLog(`Received 202 status, will retry after ${retryDelay}ms`, "info", { url: effectiveUrl });

      // Return the 202 response - caller should handle retry logic
      return response;
    }

    return response;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        throw new Error(`Request timeout after ${timeout}ms: ${effectiveUrl}`, { cause: error });
      }
      throw error;
    }
    throw new Error(`Fetch failed: ${String(error)}`, { cause: error });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch binary data (images) with timeout and URL validation
 */
export async function fetchBinary(
  url: string,
  options?: FetchOptions & { validateAsLogo?: boolean },
): Promise<{ buffer: Buffer; contentType: string }> {
  // Validate URL to prevent SSRF attacks
  const schema = options?.validateAsLogo ? logoUrlSchema : openGraphUrlSchema;
  const validatedUrl = schema.parse(url);

  const response = await fetchWithTimeout(validatedUrl, options);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "application/octet-stream";

  return { buffer, contentType };
}

/**
 * Fetch JSON with timeout and validation
 */
export async function fetchJson<T>(url: string, options?: FetchOptions): Promise<T> {
  const response = await fetchWithTimeout(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data: unknown = await response.json();
  return data as T;
}

/**
 * Check if a URL is accessible (HEAD request)
 */
export async function checkUrlAccessible(url: string, options?: FetchOptions): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(url, {
      ...options,
      method: "HEAD",
      timeout: options?.timeout || 5000,
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Determine if an error is retryable (delegates to centralized error utils)
 * @deprecated Use isRetryableError from error-utils instead
 */
export function isRetryableHttpError(error: unknown): boolean {
  return isRetryableError(error);
}

// Extension parsing moved to content-type.ts

/**
 * Create a fetch function with exponential backoff retry
 * Uses the unified retry utility for consistent behavior
 */
export function createRetryingFetch(
  maxRetries = 3,
  baseDelayMs = 1000,
  customRetryConfig?: Partial<RetryConfig>,
): typeof fetchWithTimeout {
  return async (url: string, options?: FetchOptions) => {
    // Use consolidated HTTP client retry configuration as base
    const config = {
      ...RETRY_CONFIGS.HTTP_CLIENT,
      maxRetries,
      baseDelay: baseDelayMs,
      ...customRetryConfig,
    };

    const response = await retryWithOptions(async () => fetchWithTimeout(url, options), config);

    if (!response) {
      throw new Error(`All ${maxRetries} retries failed for ${url}`);
    }

    return response;
  };
}

/**
 * Fetch with retry and proxy support
 * Convenience function that combines retry logic with proxy handling
 */
export async function fetchWithRetryAndProxy(
  url: string,
  options: FetchOptions & {
    proxies?: string[];
    maxRetries?: number;
    baseDelay?: number;
  } = {},
): Promise<Response> {
  const { proxies = [], maxRetries = 3, baseDelay = 1000, ...fetchOptions } = options;

  // Try direct fetch first, then proxies if provided
  const urlsToTry = [url, ...proxies.map(proxy => ({ url, proxy }))];

  for (const urlConfig of urlsToTry) {
    const targetUrl = typeof urlConfig === "string" ? urlConfig : urlConfig.url;
    const proxyUrl = typeof urlConfig === "string" ? undefined : urlConfig.proxy;

    try {
      const retryingFetch = createRetryingFetch(maxRetries, baseDelay);
      const response = await retryingFetch(targetUrl, {
        ...fetchOptions,
        proxyUrl,
      });

      return response;
    } catch (error) {
      debugLog(`Failed to fetch ${targetUrl}${proxyUrl ? ` via proxy ${proxyUrl}` : ""}`, "warn", {
        error: error instanceof Error ? error.message : String(error),
      });

      // Continue to next URL/proxy
      if (urlConfig !== urlsToTry[urlsToTry.length - 1]) {
        continue;
      }

      // Last attempt failed, throw the error
      throw error;
    }
  }

  throw new Error(`All fetch attempts failed for ${url}`);
}

/**
 * Get browser-like headers with random user agent
 * Useful for fetching from sites that block non-browser requests
 */
export function getBrowserHeaders(): Record<string, string> {
  const userAgents = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
  ];

  return {
    ...BROWSER_HEADERS,
    "User-Agent": userAgents[Math.floor(Math.random() * userAgents.length)] as string,
    Referer: "https://www.google.com/",
  };
}
