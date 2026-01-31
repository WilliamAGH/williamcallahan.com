/**
 * HTTP-related type definitions
 */

import type { RetryConfig } from "./lib";

export interface FetchOptions extends RequestInit {
  /** Timeout in milliseconds */
  timeout?: number;
  /** User agent string */
  userAgent?: string;
  /** Whether to follow redirects */
  followRedirects?: boolean;
  /** Maximum redirects to follow */
  maxRedirects?: number;
  /** Proxy URL to use (e.g., for Twitter -> fxtwitter.com) */
  proxyUrl?: string;
  /** Handle 202 Accepted responses with retry (GitHub API pattern) */
  handle202Retry?: boolean;
  /** Custom retry configuration */
  retryConfig?: RetryConfig;
  /** Whether to use browser-like headers */
  useBrowserHeaders?: boolean;
}

export interface CloudflareHeaderValidation {
  isValid: boolean;
  reasons: string[];
  details: {
    host?: string;
    cfRay?: string;
    cfConnectingIp?: string;
    trueClientIp?: string;
    forwardedProto?: string;
  };
}
