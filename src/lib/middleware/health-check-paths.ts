/**
 * Health Check Path Constants
 *
 * Single source of truth for health check endpoints that should bypass
 * rate limiting and load shedding middleware.
 *
 * @module lib/middleware/health-check-paths
 */

/**
 * Canonical list of health check paths.
 * These endpoints are exempt from rate limiting and memory pressure shedding
 * to ensure Kubernetes/infrastructure probes always receive responses.
 */
export const HEALTH_CHECK_PATHS = [
  "/api/health", // Primary health endpoint
  "/api/health/metrics", // Prometheus metrics
  "/api/health/deep", // Deep health check (dependencies)
  "/healthz", // Kubernetes liveness probe
  "/livez", // Kubernetes liveness probe (alias)
  "/readyz", // Kubernetes readiness probe
] as const;

/**
 * Check if a pathname is a health check endpoint
 */
export function isHealthCheckPath(pathname: string): boolean {
  return HEALTH_CHECK_PATHS.some((path) => pathname.startsWith(path));
}
