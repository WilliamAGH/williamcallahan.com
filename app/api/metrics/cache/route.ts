/**
 * Cache Metrics Endpoint
 *
 * Provides detailed cache statistics for monitoring systems like Grafana.
 * Returns metrics from both ImageMemoryManager and ServerCache instances.
 *
 * @module app/api/metrics/cache
 */

import { NextResponse } from "next/server";
import { ImageMemoryManagerInstance } from "@/lib/image-memory-manager";
import { ServerCacheInstance } from "@/lib/server-cache";

export const dynamic = "force-dynamic";

/**
 * GET /api/metrics/cache
 * @description Returns detailed cache metrics for monitoring and observability.
 * @returns {NextResponse} JSON response with cache statistics
 */
export function GET(): NextResponse {
  try {
    // Get metrics from both cache systems
    const imageMemoryMetrics = ImageMemoryManagerInstance.getMetrics();
    const serverCacheStats = ServerCacheInstance.getStats();
    
    // Get process memory for context
    const memUsage = process.memoryUsage();
    
    const response = {
      timestamp: new Date().toISOString(),
      process: {
        rss: Math.round(memUsage.rss / 1024 / 1024), // MB
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
        external: Math.round(memUsage.external / 1024 / 1024), // MB
      },
      caches: {
        imageMemory: {
          // Buffer cache metrics
          bufferCache: {
            size: imageMemoryMetrics.cacheSize,
            bytes: imageMemoryMetrics.cacheBytes,
            bytesInMB: Math.round(imageMemoryMetrics.cacheBytes / 1024 / 1024),
            memoryPressure: imageMemoryMetrics.memoryPressure,
          },
          // Process memory metrics
          memory: {
            rss: Math.round(imageMemoryMetrics.rss / 1024 / 1024), // MB
            heapUsed: Math.round(imageMemoryMetrics.heapUsed / 1024 / 1024), // MB
            external: Math.round(imageMemoryMetrics.external / 1024 / 1024), // MB
          },
        },
        serverCache: {
          keys: serverCacheStats.keys,
          hits: serverCacheStats.hits,
          misses: serverCacheStats.misses,
          hitRate: serverCacheStats.hits + serverCacheStats.misses > 0
            ? (serverCacheStats.hits / (serverCacheStats.hits + serverCacheStats.misses)) * 100
            : 0,
          sizeBytes: serverCacheStats.sizeBytes || 0,
          sizeInMB: Math.round((serverCacheStats.sizeBytes || 0) / 1024 / 1024),
          maxSizeBytes: serverCacheStats.maxSizeBytes || 0,
          maxSizeInMB: Math.round((serverCacheStats.maxSizeBytes || 0) / 1024 / 1024),
          utilizationPercent: serverCacheStats.utilizationPercent || 0,
        },
      },
      // Total memory usage by caches
      totalCacheMemory: {
        bytes: imageMemoryMetrics.cacheBytes + (serverCacheStats.sizeBytes || 0),
        inMB: Math.round((imageMemoryMetrics.cacheBytes + (serverCacheStats.sizeBytes || 0)) / 1024 / 1024),
        percentOfHeap: memUsage.heapUsed > 0 
          ? ((imageMemoryMetrics.cacheBytes + (serverCacheStats.sizeBytes || 0)) / memUsage.heapUsed) * 100
          : 0,
      },
    };

    // Add Prometheus-style metrics as plain text if requested
    const acceptHeader = String(process.env.METRICS_FORMAT || "json").toLowerCase();
    if (acceptHeader === "prometheus") {
      const metrics = [
        `# HELP process_memory_rss_bytes Resident set size in bytes`,
        `# TYPE process_memory_rss_bytes gauge`,
        `process_memory_rss_bytes ${memUsage.rss}`,
        `# HELP image_cache_size Number of items in image cache`,
        `# TYPE image_cache_size gauge`,
        `image_cache_size ${imageMemoryMetrics.cacheSize}`,
        `# HELP image_cache_bytes Total bytes in image cache`,
        `# TYPE image_cache_bytes gauge`,
        `image_cache_bytes ${imageMemoryMetrics.cacheBytes}`,
        `# HELP server_cache_keys Number of keys in server cache`,
        `# TYPE server_cache_keys gauge`,
        `server_cache_keys ${serverCacheStats.keys}`,
        `# HELP server_cache_hit_rate Cache hit rate percentage`,
        `# TYPE server_cache_hit_rate gauge`,
        `server_cache_hit_rate ${response.caches.serverCache.hitRate}`,
      ].join("\n");

      return new NextResponse(metrics, {
        headers: { "Content-Type": "text/plain; version=0.0.4" },
      });
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error retrieving cache metrics:", error);
    return NextResponse.json({ error: "Failed to retrieve cache metrics" }, { status: 500 });
  }
}