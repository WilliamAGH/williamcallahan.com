/**
 * Shared HTTP Client Utilities
 *
 * Consolidated fetch utilities with unified retry, timeout, and error handling
 * Supports domain-specific requirements while maintaining a consistent API
 */

import { debugLog } from "./debug";
import { retryWithOptions, RETRY_CONFIGS } from "./retry";
import type { RetryConfig } from "@/types/lib";
import type { FetchOptions } from "@/types/http";
import { logoUrlSchema, openGraphUrlSchema } from "@/types/schemas/url";

function stripQueryAndHash(url: string): string {
  try {
    const urlObj = new URL(url);
    urlObj.search = "";
    urlObj.hash = "";
    return urlObj.toString();
  } catch {
    const noQuery = url.split("?")[0] ?? url;
    return noQuery.split("#")[0] ?? noQuery;
  }
}

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
 * Build effective URL with proxy if specified
 */
function buildProxyUrl(url: string, proxyUrl: string | undefined): string {
  if (!proxyUrl) return url;

  const originalUrl = new URL(url);
  const proxyUrlObj = new URL(proxyUrl);
  proxyUrlObj.pathname = originalUrl.pathname;
  proxyUrlObj.search = originalUrl.search;
  const effectiveUrl = proxyUrlObj.toString();

  debugLog(`Using proxy: ${stripQueryAndHash(url)} -> ${stripQueryAndHash(effectiveUrl)}`, "info");

  return effectiveUrl;
}

/**
 * Setup abort signal handling
 */
function setupAbortSignal(
  controller: AbortController,
  signal: AbortSignal | null | undefined,
): { abortedByExternalSignal: boolean } {
  const state = { abortedByExternalSignal: false };

  if (!signal) return state;

  if (signal.aborted) {
    state.abortedByExternalSignal = true;
    controller.abort(signal.reason);
  } else {
    signal.addEventListener(
      "abort",
      () => {
        state.abortedByExternalSignal = true;
        controller.abort(signal.reason);
      },
      { once: true },
    );
  }

  return state;
}

/**
 * Handle fetch errors with proper abort/timeout distinction
 */
function handleFetchError(
  error: unknown,
  abortedByExternalSignal: boolean,
  timeout: number,
  effectiveUrl: string,
): never {
  if (!(error instanceof Error)) {
    throw new Error(`Fetch failed: ${String(error)}`, { cause: error });
  }

  if (error.name !== "AbortError") {
    throw error;
  }

  // If aborted by external signal (user cancellation), re-throw as AbortError
  // so callers can distinguish from timeout and skip retries
  if (abortedByExternalSignal) {
    throw new DOMException("Request aborted", "AbortError");
  }

  // Internal timeout - wrap with timeout message
  // Strip query params to prevent leaking tokens/secrets in error messages
  throw new Error(`Request timeout after ${timeout}ms: ${stripQueryAndHash(effectiveUrl)}`, {
    cause: error,
  });
}

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
    signal,
    ...fetchOptions
  } = options;

  const effectiveUrl = buildProxyUrl(url, proxyUrl);
  const defaultHeaders = useBrowserHeaders ? BROWSER_HEADERS : DEFAULT_IMAGE_HEADERS;

  const controller = new AbortController();
  const { abortedByExternalSignal } = setupAbortSignal(controller, signal);
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
      const retryDelay = retryAfter ? Number.parseInt(retryAfter, 10) * 1000 : 5000;

      debugLog(`Received 202 status, will retry after ${retryDelay}ms`, "info", {
        url: effectiveUrl,
      });

      // Return the 202 response - caller should handle retry logic
      return response;
    }

    return response;
  } catch (error) {
    handleFetchError(error, abortedByExternalSignal, timeout, effectiveUrl);
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
      throw new Error(`All ${maxRetries} retries failed for ${stripQueryAndHash(url)}`);
    }

    return response;
  };
}

/**
 * Try fetching with a single URL/proxy configuration
 */
async function trySingleFetch(
  urlConfig: string | { url: string; proxy: string },
  maxRetries: number,
  baseDelay: number,
  fetchOptions: FetchOptions,
): Promise<Response> {
  const targetUrl = typeof urlConfig === "string" ? urlConfig : urlConfig.url;
  const proxyUrl = typeof urlConfig === "string" ? undefined : urlConfig.proxy;

  const retryingFetch = createRetryingFetch(maxRetries, baseDelay);
  return retryingFetch(targetUrl, {
    ...fetchOptions,
    proxyUrl,
  });
}

/**
 * Build debug message for failed fetch
 */
function buildFetchErrorMessage(targetUrl: string, proxyUrl: string | undefined): string {
  const baseMessage = `Failed to fetch ${targetUrl}`;
  if (!proxyUrl) {
    return baseMessage;
  }
  return `${baseMessage} via proxy ${proxyUrl}`;
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
  const urlsToTry: Array<string | { url: string; proxy: string }> = [
    url,
    ...proxies.map((proxy) => ({ url, proxy })),
  ];

  for (let i = 0; i < urlsToTry.length; i++) {
    const urlConfig = urlsToTry[i]!;
    const targetUrl = typeof urlConfig === "string" ? urlConfig : urlConfig.url;
    const proxyUrl = typeof urlConfig === "string" ? undefined : urlConfig.proxy;
    const isLastAttempt = i === urlsToTry.length - 1;

    try {
      return await trySingleFetch(urlConfig, maxRetries, baseDelay, fetchOptions);
    } catch (error) {
      const errorMessage = buildFetchErrorMessage(targetUrl, proxyUrl);
      debugLog(errorMessage, "warn", {
        error: error instanceof Error ? error.message : String(error),
      });

      if (!isLastAttempt) {
        continue;
      }

      throw error;
    }
  }

  throw new Error(`All fetch attempts failed for ${stripQueryAndHash(url)}`);
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
