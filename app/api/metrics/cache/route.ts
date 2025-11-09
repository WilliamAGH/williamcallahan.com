/**
 * Cache Metrics Endpoint
 *
 * @deprecated Next.js cache doesn't expose detailed metrics like traditional cache implementations.
 * This endpoint now returns process memory metrics only.
 * Image caching has been removed - images are served directly from S3/CDN.
 *
 * @module app/api/metrics/cache
 */

import { NextResponse } from "next/server";

/**
 * GET /api/metrics/cache
 * @description Returns process memory metrics. Cache-specific metrics are no longer available.
 * @deprecated This endpoint's cache metrics functionality has been removed.
 * @returns {NextResponse} JSON response with process memory statistics
 */
export function GET(): NextResponse {
  try {
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
        message: "Cache metrics are no longer available",
        notes: [
          "Next.js cache doesn't expose metrics like traditional cache implementations",
          "Image caching has been removed - images served directly from S3/CDN",
          "ServerCache uses simple Map-based implementation with TTL and size-aware eviction",
        ],
      },
    };

    // Add Prometheus-style metrics as plain text if requested
    const acceptHeader = String(process.env.METRICS_FORMAT || "json").toLowerCase();
    if (acceptHeader === "prometheus") {
      const metrics = [
        `# HELP process_memory_rss_bytes Resident set size in bytes`,
        `# TYPE process_memory_rss_bytes gauge`,
        `process_memory_rss_bytes ${memUsage.rss}`,
        `# HELP process_memory_heap_used_bytes Heap used in bytes`,
        `# TYPE process_memory_heap_used_bytes gauge`,
        `process_memory_heap_used_bytes ${memUsage.heapUsed}`,
        `# HELP process_memory_heap_total_bytes Heap total in bytes`,
        `# TYPE process_memory_heap_total_bytes gauge`,
        `process_memory_heap_total_bytes ${memUsage.heapTotal}`,
        `# HELP process_memory_external_bytes External memory in bytes`,
        `# TYPE process_memory_external_bytes gauge`,
        `process_memory_external_bytes ${memUsage.external}`,
      ].join("\n");

      return new NextResponse(metrics, {
        headers: { "Content-Type": "text/plain; version=0.0.4" },
      });
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error retrieving metrics:", error);
    return NextResponse.json({ error: "Failed to retrieve metrics" }, { status: 500 });
  }
}
