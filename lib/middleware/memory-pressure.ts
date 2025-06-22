/**
 * Memory Pressure Middleware
 *
 * Provides consistent 503 responses when system is under memory pressure.
 * Must be one of the first middleware to run to avoid wasting resources.
 *
 * Features:
 * - Returns 503 Service Unavailable when memory critical
 * - Includes Retry-After header for client backoff
 * - Exempts health check endpoints
 * - Logs and emits metrics for monitoring
 * - Edge Runtime compatible (no Node.js APIs)
 *
 * Runtime Behavior:
 * - Edge Runtime: Uses environment-based memory pressure detection
 * - Node.js Runtime: Same behavior, but can be enhanced with process monitoring
 *
 * @module lib/middleware/memory-pressure
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Health check paths that should always be allowed
const HEALTH_CHECK_PATHS = ["/api/health", "/api/health/metrics", "/healthz", "/livez", "/readyz"];

/**
 * Check memory pressure using Edge Runtime-compatible methods
 * This approach uses environment variables or simple heuristics
 * instead of direct Node.js process.memoryUsage() calls
 */
function isMemoryPressureCritical(): boolean {
  // Check for explicit memory pressure flag from external monitors
  if (typeof process !== "undefined" && process.env?.MEMORY_PRESSURE_CRITICAL === "true") {
    return true;
  }

  // In Edge Runtime, we can't check actual memory usage
  // So we rely on external monitoring systems to set environment flags
  return false;
}

/**
 * Check memory warning state using Edge Runtime-compatible methods
 */
function isMemoryPressureWarning(): boolean {
  // Check for explicit memory warning flag from external monitors
  if (typeof process !== "undefined" && process.env?.MEMORY_PRESSURE_WARNING === "true") {
    return true;
  }

  return false;
}

/**
 * Check if we can access health endpoint for memory status
 * This provides a fallback mechanism for memory checking
 */
async function checkMemoryViaHealthEndpoint(): Promise<{ critical: boolean; warning: boolean }> {
  try {
    // Only check if we have a health endpoint available
    const { getBaseUrl } = await import("@/lib/utils/get-base-url");
    const healthUrl = new URL("/api/health", getBaseUrl());

    // Quick fetch with short timeout to avoid blocking
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 100); // 100ms timeout

    const response = await fetch(healthUrl.toString(), {
      method: "HEAD", // Use HEAD to avoid response body
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Check response headers for memory status
    const systemStatus = response.headers.get("X-System-Status");

    return {
      critical: systemStatus === "MEMORY_CRITICAL",
      warning: systemStatus === "MEMORY_WARNING",
    };
  } catch {
    // If health check fails, assume no memory pressure
    return { critical: false, warning: false };
  }
}

/**
 * Memory pressure middleware
 * Returns 503 when system is under critical memory pressure
 * Edge Runtime compatible with multiple detection methods
 */
export async function memoryPressureMiddleware(request: NextRequest): Promise<NextResponse | null> {
  const pathname = request.nextUrl.pathname;

  // Always allow health checks through
  if (HEALTH_CHECK_PATHS.some((path) => pathname.startsWith(path))) {
    return null; // Continue to next middleware
  }

  // Primary check: Environment-based memory pressure detection
  const envCritical = isMemoryPressureCritical();
  const envWarning = isMemoryPressureWarning();

  // Secondary check: Health endpoint (with fallback)
  let healthStatus = { critical: false, warning: false };
  if (!envCritical && !envWarning) {
    // Only check health endpoint if env flags are not set
    try {
      healthStatus = await checkMemoryViaHealthEndpoint();
    } catch {
      // Health check failed, continue with env-only status
    }
  }

  const isCritical = envCritical || healthStatus.critical;
  const isWarning = envWarning || healthStatus.warning;

  // Check memory pressure
  if (isCritical) {
    console.warn(`[MemoryPressure] Shedding load due to memory pressure: ${pathname} ${request.method}`);

    // Return 503 with proper headers
    return NextResponse.json(
      {
        error: "Service temporarily unavailable due to high memory usage",
        retry: true,
      },
      {
        status: 503,
        headers: {
          "Retry-After": "10", // Tell clients to retry after 10 seconds
          "X-System-Status": "MEMORY_CRITICAL",
          "Cache-Control": "no-store",
        },
      },
    );
  }

  // Check if we're in warning state (optional header)
  if (isWarning) {
    // Continue processing but add warning header
    const response = NextResponse.next();
    response.headers.set("X-System-Status", "MEMORY_WARNING");
    return response;
  }

  // Normal operation - continue to next middleware
  return null;
}

/**
 * Create memory pressure middleware for Next.js App Router
 * This version is fully Edge Runtime compatible
 */
export function createMemoryPressureMiddleware() {
  return async function middleware(request: NextRequest) {
    return (await memoryPressureMiddleware(request)) || NextResponse.next();
  };
}
