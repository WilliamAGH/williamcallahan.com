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

import { NextResponse, type NextRequest } from "next/server";
import { debug } from "@/lib/utils/debug";
import type { MemoryPressureOverrides, MemoryPressureStatus } from "@/types/middleware";

// Health check paths that should always be allowed
const HEALTH_CHECK_PATHS = ["/api/health", "/api/health/metrics", "/healthz", "/livez", "/readyz"];

const MEMORY_WARNING_UTILIZATION = 0.85;
const MEMORY_CRITICAL_UTILIZATION = 0.92;

/**
 * Check memory pressure using Edge Runtime-compatible methods
 * This approach uses environment variables or simple heuristics
 * instead of direct Node.js process.memoryUsage() calls
 */
function isMemoryPressureCriticalFromEnv(): boolean {
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
function isMemoryPressureWarningFromEnv(): boolean {
  // Check for explicit memory warning flag from external monitors
  if (typeof process !== "undefined" && process.env?.MEMORY_PRESSURE_WARNING === "true") {
    return true;
  }

  return false;
}

/**
 * Try to read the container memory limit from cgroups (Linux).
 * Returns null when unavailable or unlimited.
 */
let cgroupLimitBytesPromise: Promise<number | null> | null = null;
async function getCgroupMemoryLimitBytes(): Promise<number | null> {
  if (cgroupLimitBytesPromise) return cgroupLimitBytesPromise;

  cgroupLimitBytesPromise = (async () => {
    // If we are not in Node.js, we cannot read cgroups.
    if (typeof process === "undefined" || !process.versions?.node) return null;

    try {
      const { readFile } = await import("node:fs/promises");

      const readTrimmed = async (filePath: string): Promise<string | null> => {
        try {
          const raw = await readFile(filePath, "utf8");
          return raw.trim();
        } catch (err) {
          debug(`[MemoryPressure] Could not read ${filePath}:`, err);
          return null;
        }
      };

      // cgroup v2
      const v2 = await readTrimmed("/sys/fs/cgroup/memory.max");
      if (v2 && v2 !== "max") {
        const parsed = Number(v2);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
      }

      // cgroup v1
      const v1 = await readTrimmed("/sys/fs/cgroup/memory/memory.limit_in_bytes");
      if (v1) {
        const parsed = Number(v1);
        // Some hosts expose a huge "no limit" number; ignore obviously-unbounded values.
        if (Number.isFinite(parsed) && parsed > 0 && parsed < 1024 * 1024 * 1024 * 1024)
          return parsed;
      }

      return null;
    } catch (err) {
      debug("[MemoryPressure] Failed to read cgroup memory limit:", err);
      return null;
    }
  })();

  return cgroupLimitBytesPromise;
}

async function getNodeMemoryPressureStatus(
  overrides?: MemoryPressureOverrides,
): Promise<(MemoryPressureStatus & { rssBytes: number; limitBytes: number | null }) | null> {
  if (typeof process === "undefined" || !process.versions?.node) return null;
  if (typeof process.memoryUsage !== "function") return null;

  const rssBytes = overrides?.rssBytes ?? process.memoryUsage().rss;
  const limitBytes = overrides?.limitBytes ?? (await getCgroupMemoryLimitBytes());

  if (!limitBytes) {
    // No reliable limit: do not guess and do not shed. Rate limiting is the primary guard.
    return { critical: false, warning: false, rssBytes, limitBytes: null };
  }

  const utilization = rssBytes / limitBytes;
  return {
    critical: utilization >= MEMORY_CRITICAL_UTILIZATION,
    warning: utilization >= MEMORY_WARNING_UTILIZATION,
    rssBytes,
    limitBytes,
  };
}

/**
 * Memory pressure middleware
 * Returns 503 when system is under critical memory pressure
 * Edge Runtime compatible with multiple detection methods
 */
export async function memoryPressureMiddleware(
  request: NextRequest,
  overrides?: MemoryPressureOverrides,
): Promise<NextResponse | null> {
  const pathname = request.nextUrl?.pathname ?? new URL(request.url).pathname;

  // Always allow health checks through
  if (HEALTH_CHECK_PATHS.some((path) => pathname.startsWith(path))) {
    return null; // Continue to next middleware
  }

  // Primary check: Environment-based memory pressure detection (works in Edge too)
  const envCritical = isMemoryPressureCriticalFromEnv();
  const envWarning = isMemoryPressureWarningFromEnv();

  // Secondary check (Node.js only): in-process memory usage vs cgroup memory limit
  const nodeStatus = await getNodeMemoryPressureStatus(overrides);
  const isCritical = envCritical || Boolean(nodeStatus?.critical);
  const isWarning = envWarning || Boolean(nodeStatus?.warning);

  // Check memory pressure
  if (isCritical) {
    const details =
      nodeStatus?.limitBytes && nodeStatus.limitBytes > 0
        ? ` rss=${Math.round(nodeStatus.rssBytes / 1024 / 1024)}MB limit=${Math.round(nodeStatus.limitBytes / 1024 / 1024)}MB`
        : "";
    console.warn(
      `[MemoryPressure] Shedding load due to memory pressure: ${pathname} ${request.method}${details}`,
    );

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
    // Continue processing but add warning header.
    // NOTE: src/proxy.ts must merge this header onto the final response.
    return new NextResponse(null, {
      status: 200,
      headers: { "X-System-Status": "MEMORY_WARNING" },
    });
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
