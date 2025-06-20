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
 * - Runtime-aware (Node.js APIs only in Node.js runtime)
 * - Edge Runtime compatible (gracefully degrades)
 *
 * Runtime Behavior:
 * - Node.js Runtime: Full memory monitoring with process.memoryUsage()
 * - Edge Runtime: Bypasses memory checks (always allows requests)
 *
 * @module lib/middleware/memory-pressure
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { MemoryThresholds, MemoryChecker } from "@/types/health";

// Health check paths that should always be allowed
const HEALTH_CHECK_PATHS = ["/api/health", "/api/health/memory", "/healthz", "/livez", "/readyz"];

// Cache memory thresholds to avoid repeated imports
let MEMORY_THRESHOLDS: MemoryThresholds | null = null;

/**
 * Lazy load memory thresholds to avoid bundling issues
 */
async function getMemoryThresholds(): Promise<MemoryThresholds> {
  if (!MEMORY_THRESHOLDS) {
    try {
      // Dynamic import to avoid static analysis issues
      const constants = await import("@/lib/constants");
      MEMORY_THRESHOLDS = constants.MEMORY_THRESHOLDS;
    } catch {
      // Fallback thresholds if import fails
      MEMORY_THRESHOLDS = {
        MEMORY_CRITICAL_THRESHOLD: 1024 * 1024 * 1024, // 1GB
        MEMORY_WARNING_THRESHOLD: 512 * 1024 * 1024, // 512MB
        IMAGE_RAM_BUDGET_BYTES: 512 * 1024 * 1024, // 512MB
        IMAGE_STREAM_THRESHOLD_BYTES: 5 * 1024 * 1024, // 5MB
      };
    }
  }
  return MEMORY_THRESHOLDS;
}

/**
 * Runtime detection utility
 * Edge Runtime detection using environment variables and global availability
 */
function isEdgeRuntime(): boolean {
  // Check for Edge Runtime environment variables
  if (typeof process !== "undefined" && process.env?.NEXT_RUNTIME === "edge") {
    return true;
  }

  // Check for Edge Runtime globals (WebAssembly, crypto, etc.)
  if (typeof WebAssembly !== "undefined" && typeof crypto !== "undefined" && typeof process === "undefined") {
    return true;
  }

  // Check if Node.js APIs are unavailable
  return typeof process === "undefined" || typeof process.memoryUsage !== "function";
}

/**
 * Node.js memory checker implementation
 */
class NodeMemoryChecker implements MemoryChecker {
  async isMemoryCritical(): Promise<boolean> {
    try {
      if (typeof process === "undefined" || typeof process.memoryUsage !== "function") {
        return false;
      }

      const usage = process.memoryUsage();
      const thresholds = await getMemoryThresholds();
      return usage.rss > thresholds.MEMORY_CRITICAL_THRESHOLD;
    } catch {
      return false;
    }
  }

  async isMemoryWarning(): Promise<boolean> {
    try {
      if (typeof process === "undefined" || typeof process.memoryUsage !== "function") {
        return false;
      }

      const usage = process.memoryUsage();
      const thresholds = await getMemoryThresholds();
      return usage.rss > thresholds.MEMORY_WARNING_THRESHOLD;
    } catch {
      return false;
    }
  }
}

/**
 * Edge Runtime memory checker implementation (no-op)
 */
class EdgeMemoryChecker implements MemoryChecker {
  isMemoryCritical(): Promise<boolean> {
    // Edge Runtime doesn't support memory monitoring - always allow requests
    return Promise.resolve(false);
  }

  isMemoryWarning(): Promise<boolean> {
    // Edge Runtime doesn't support memory monitoring - never in warning state
    return Promise.resolve(false);
  }
}

/**
 * Get appropriate memory checker based on runtime
 */
function createMemoryChecker(): MemoryChecker {
  return isEdgeRuntime() ? new EdgeMemoryChecker() : new NodeMemoryChecker();
}

// Initialize memory checker
const memoryChecker = createMemoryChecker();

/**
 * Memory pressure middleware
 * Returns 503 when system is under critical memory pressure
 * Runtime-aware with proper async handling
 */
export async function memoryPressureMiddleware(request: NextRequest): Promise<NextResponse | null> {
  const pathname = request.nextUrl.pathname;

  // Always allow health checks through
  if (HEALTH_CHECK_PATHS.some((path) => pathname.startsWith(path))) {
    return null; // Continue to next middleware
  }

  // Check memory pressure (async for proper runtime detection)
  if (await memoryChecker.isMemoryCritical()) {
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
  if (await memoryChecker.isMemoryWarning()) {
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
 * This version works with proper runtime detection
 */
export function createMemoryPressureMiddleware() {
  return async function middleware(request: NextRequest) {
    return (await memoryPressureMiddleware(request)) || NextResponse.next();
  };
}
