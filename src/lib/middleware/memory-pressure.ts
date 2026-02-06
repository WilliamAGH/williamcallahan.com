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
import { buildApiServiceBusyResponse, buildServiceBusyPageResponse } from "@/lib/utils/api-utils";
import { classifyProxyRequest, getClientIp, hashIpBucket } from "@/lib/utils/request-utils";
import type {
  MemoryPressureLevel,
  MemoryPressureOverrides,
  MemoryPressureStatus,
  ProxyRequestClass,
} from "@/types/middleware";
import { isHealthCheckPath } from "./health-check-paths";

/** RSS/limit ratio at which a warning header is emitted (85%). Chosen to give
 *  the operator a ~7% runway to react before critical shedding kicks in. */
const MEMORY_WARNING_UTILIZATION = 0.85;
/** RSS/limit ratio at which ALL non-health-check requests are shed (92%).
 *  Leaves ~8% headroom for GC, OS page cache, and in-flight allocations
 *  before the OOM killer or container runtime terminates the process. */
const MEMORY_CRITICAL_UTILIZATION = 0.92;
/** Retry-After value (seconds) sent with critical 503 responses. Three minutes
 *  aligns with typical container restart/reschedule cycles. */
const CRITICAL_SHED_RETRY_AFTER_SECONDS = 180;

/**
 * Check memory pressure using Edge Runtime-compatible environment variables.
 * External monitors set these flags when memory thresholds are exceeded.
 */
function isMemoryPressureFromEnv(level: MemoryPressureLevel): boolean {
  if (typeof process === "undefined") return false;
  const envKey = level === "CRITICAL" ? "MEMORY_PRESSURE_CRITICAL" : "MEMORY_PRESSURE_WARNING";
  return process.env?.[envKey] === "true";
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

function logLoadShedEvent(args: {
  path: string;
  requestClass: ProxyRequestClass;
  retryAfterSeconds: number;
  ip: string;
}): void {
  console.warn(
    JSON.stringify({
      type: "proxy.memory_shed.blocked",
      path: args.path,
      requestClass: args.requestClass,
      retryAfter: args.retryAfterSeconds,
      ipBucket: hashIpBucket(args.ip),
      handled: true,
    }),
  );
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
  const requestClass = classifyProxyRequest(request);

  // Always allow health checks through
  if (isHealthCheckPath(pathname)) {
    return null; // Continue to next middleware
  }

  // Primary check: Environment-based memory pressure detection (works in Edge too)
  const envCritical = isMemoryPressureFromEnv("CRITICAL");
  const envWarning = isMemoryPressureFromEnv("WARNING");

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
    const retryAfterSeconds = CRITICAL_SHED_RETRY_AFTER_SECONDS;
    const clientIp = getClientIp(request.headers, { fallback: "anonymous" });
    console.warn(
      `[MemoryPressure] Shedding load due to memory pressure: ${pathname} ${request.method}${details}`,
    );
    logLoadShedEvent({
      path: pathname,
      requestClass,
      retryAfterSeconds,
      ip: clientIp,
    });

    // Critical memory: shed ALL request classes to protect the process.
    // Response format varies by class; the shed decision does not.
    let response: NextResponse;
    if (requestClass === "document") {
      response = buildServiceBusyPageResponse({ retryAfterSeconds });
    } else if (requestClass === "api") {
      response = buildApiServiceBusyResponse({
        retryAfterSeconds,
        rateLimitScope: "memory",
      });
    } else {
      response = new NextResponse(null, {
        status: 503,
        headers: { "Retry-After": String(retryAfterSeconds), "Cache-Control": "no-store" },
      });
    }
    response.headers.set("X-System-Status", "MEMORY_CRITICAL");
    return response;
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
