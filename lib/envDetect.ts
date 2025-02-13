/**
 * Environment Detection Module
 * @module lib/envDetect
 * @description
 * Core environment detection utilities for determining production vs development context.
 * Provides consistent environment checks across server and client components.
 *
 * Related modules:
 * @see {@link "types/env.d.ts"} - Type definitions and usage examples
 * @see {@link "components/analytics/Analytics.tsx"} - Example consumer
 * @see {@link "docs/architecture/analytics.md"} - Architecture documentation
 */

/** Production URL for environment detection */
const PRODUCTION_URL = 'https://williamcallahan.com' as const;

/**
 * Type-safe environment variable access
 * @param name - Environment variable name
 * @returns Environment variable value or undefined
 */
function getEnvVar(name: keyof NodeJS.ProcessEnv): string | undefined {
  return process.env[name];
}

/**
 * Normalizes a URL by removing trailing slashes
 * @param url - URL to normalize
 * @returns Normalized URL
 */
function normalizeUrl(url: string): string {
  return url.replace(/\/$/, '');
}

/**
 * Checks if the current environment is production
 * @returns true if NEXT_PUBLIC_SITE_URL matches production URL
 */
export function isProduction(): boolean {
  const siteUrl = getEnvVar('NEXT_PUBLIC_SITE_URL');
  if (!siteUrl) return false;
  return normalizeUrl(siteUrl) === PRODUCTION_URL;
}

/**
 * Checks if the current environment is development
 * @returns true if not production
 */
export function isDevelopment(): boolean {
  return !isProduction();
}

/**
 * Type guard for production environment
 * @param value - Value to guard
 * @returns Type predicate for production context
 */
export function isProductionGuard<T>(value: T): value is T & { production: true } {
  return isProduction();
}
