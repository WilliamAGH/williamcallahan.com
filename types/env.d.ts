/**
 * Environment Types
 * @module types/env
 */

/**
 * Type guard for production environment
 * Useful when certain variables or behaviors should only exist in production.
 *
 * @example
 * ```typescript
 * import { isProduction } from '@/lib/envDetect';
 *
 * if (isProduction()) {
 *   analytics.track('event');
 * } else {
 *   console.debug('Analytics disabled in non-production');
 * }
 * ```
 */
export type ProductionGuard<T> = T & { production: true };

/**
 * Environment detection utilities
 * Provides type-safe utilities for detecting the current environment context.
 *
 * @example
 * ```typescript
 * import { isProduction, isDevelopment } from '@/lib/envDetect';
 *
 * // Check for production environment
 * if (isProduction()) {
 *   // Run production-only code
 * }
 *
 * // Check for development environment
 * if (isDevelopment()) {
 *   console.debug('Debug logging enabled');
 * }
 *
 * // Using type guard
 * const config = {
 *   apiKey: process.env.API_KEY,
 *   // ... other fields
 * };
 *
 * if (isProductionGuard(config)) {
 *   // config is narrowed to production type
 * }
 * ```
 */
declare module '@/lib/envDetect' {
  export function isProduction(): boolean;
  export function isDevelopment(): boolean;
  export function isProductionGuard<T>(value: T): value is ProductionGuard<T>;
}
