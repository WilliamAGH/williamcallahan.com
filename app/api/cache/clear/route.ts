/**
 * Cache Clear API Route
 * @module app/api/cache/clear
 * @description
 * Server-side API endpoint for clearing server caches.
 * This is useful for development and testing.
 *
 * Extended with cache corruption detection and automatic recovery
 */

import { NextRequest, NextResponse } from "next/server";
import { ServerCacheInstance } from "@/lib/server-cache";
import { ImageMemoryManagerInstance } from "@/lib/image-memory-manager";

/**
 * Validates API key for cache operations
 */
function validateApiKey(request: NextRequest): boolean {
  const apiKey = process.env.CACHE_API_KEY;
  if (!apiKey) {
    console.warn("[Cache API] CACHE_API_KEY not configured");
    return false;
  }

  const providedKey = request.headers.get("x-api-key") || request.nextUrl.searchParams.get("key");
  return providedKey === apiKey;
}

/**
 * Detects and reports cache corruption issues
 */
function detectCacheCorruption() {
  const stats = {
    totalEntries: 0,
    corruptedEntries: 0,
    emptyEntries: 0,
    invalidOpenGraphEntries: 0,
    oversizedEntries: 0,
    repaired: false,
  };

  try {
    const keys = ServerCacheInstance.keys();
    stats.totalEntries = keys.length;

    for (const key of keys) {
      const value = ServerCacheInstance.get(key);

      // Check for empty or null values
      if (value === null || value === undefined) {
        stats.emptyEntries++;
        ServerCacheInstance.del(key);
        continue;
      }

      // Check OpenGraph entries for corruption
      if (key.startsWith("og-data:")) {
        const ogData = value as Record<string, unknown>;
        if (!ogData.url || !ogData.title || (ogData.error && typeof ogData.error !== "string")) {
          console.warn(`[Cache Health] Corrupted OpenGraph entry detected: ${key}`);
          stats.invalidOpenGraphEntries++;
          ServerCacheInstance.del(key);
          continue;
        }
      }

      // Check for oversized entries (>10MB)
      if (Buffer.isBuffer(value) && value.byteLength > 10 * 1024 * 1024) {
        console.warn(`[Cache Health] Oversized buffer detected: ${key} (${value.byteLength} bytes)`);
        stats.oversizedEntries++;
        ServerCacheInstance.del(key);
        continue;
      }

      // Check for obviously corrupted objects
      if (typeof value === "object" && value !== null) {
        try {
          const objStr = JSON.stringify(value);
          if (objStr.includes("undefined") || objStr.includes("[object Object]")) {
            stats.corruptedEntries++;
            ServerCacheInstance.del(key);
          }
        } catch {
          // If JSON.stringify fails, it's definitely corrupted
          stats.corruptedEntries++;
          ServerCacheInstance.del(key);
        }
      }
    }

    if (stats.emptyEntries || stats.invalidOpenGraphEntries || stats.oversizedEntries || stats.corruptedEntries) {
      stats.repaired = true;
      console.log(`[Cache Health] Repaired cache corruption: ${JSON.stringify(stats)}`);
    }
  } catch (error) {
    console.error("[Cache Health] Error during corruption detection:", error);
  }

  return stats;
}

/**
 * GET - Check cache health and detect corruption
 */
export function GET(request: NextRequest): NextResponse {
  if (!validateApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const corruptionStats = detectCacheCorruption();
    const cacheStats = ServerCacheInstance.getStats();
    const imageStats = ImageMemoryManagerInstance.getMetrics();

    return NextResponse.json({
      status: "success",
      message: "Cache health check completed",
      data: {
        cache: cacheStats,
        imageMemory: imageStats,
        corruption: corruptionStats,
        recommendations: corruptionStats.repaired
          ? ["Cache corruption was detected and automatically repaired"]
          : ["Cache appears healthy"],
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Failed to check cache health:", errorMessage);
    return NextResponse.json(
      {
        status: "error",
        message: "Failed to check cache health",
        error: errorMessage,
      },
      { status: 500 },
    );
  }
}

/**
 * POST - Clear all caches and image memory
 */
export function POST(request: NextRequest): NextResponse {
  if (!validateApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Run corruption detection first
    const corruptionStats = detectCacheCorruption();

    // Clear all caches
    const beforeStats = ServerCacheInstance.getStats();
    ServerCacheInstance.clearAllCaches();

    // Clear image memory manager
    const beforeImageStats = ImageMemoryManagerInstance.getMetrics();
    ImageMemoryManagerInstance.clear();

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    return NextResponse.json({
      status: "success",
      message: "All caches cleared successfully",
      data: {
        before: {
          cache: beforeStats,
          imageMemory: beforeImageStats,
          corruption: corruptionStats,
        },
        after: {
          cache: ServerCacheInstance.getStats(),
          imageMemory: ImageMemoryManagerInstance.getMetrics(),
        },
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Failed to clear caches:", errorMessage);
    return NextResponse.json(
      {
        status: "error",
        message: "Failed to clear caches",
        error: errorMessage,
      },
      { status: 500 },
    );
  }
}
