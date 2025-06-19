/**
 * Memory Leak Prevention Tests
 *
 * Comprehensive tests to ensure memory leak prevention mechanisms work correctly
 */

import { ImageMemoryManagerInstance, destroyImageMemoryManager } from "../lib/image-memory-manager";
import { getImageMemoryManager } from "../lib/server-cache/index";
import { getUnifiedImageService } from "../lib/services/unified-image-service";
import { getMemoryHealthMonitor } from "../lib/health/memory-health-monitor";
import { ServerCacheInstance } from "../lib/server-cache";
import { asyncMonitor } from "../lib/async-operations-monitor";

// Mock environment variables
process.env.IMAGE_RAM_BUDGET_BYTES = String(100 * 1024 * 1024); // 100MB for testing
process.env.MAX_IMAGE_SIZE_BYTES = String(10 * 1024 * 1024); // 10MB max

describe("Memory Leak Prevention", () => {
  let initialMemory: number;

  beforeAll(() => {
    // Enable garbage collection for tests
    if (global.gc) {
      global.gc();
    }
    initialMemory = process.memoryUsage().heapUsed;
  });

  afterEach(() => {
    // Clean up after each test
    const imageManager = getImageMemoryManager();
    imageManager.clear();
    ServerCacheInstance.flushAll();

    if (global.gc) {
      global.gc();
    }
  });

  afterAll(() => {
    // Destroy singleton instances
    destroyImageMemoryManager();
  });

  describe("Buffer.slice() Memory Retention", () => {
    it("should not retain parent buffers when using fixed string conversion", () => {
      const baseline = process.memoryUsage().heapUsed;

      // Create large buffers and extract small portions
      const buffers: string[] = [];
      for (let i = 0; i < 100; i++) {
        const large = Buffer.alloc(10 * 1024 * 1024); // 10MB
        // Fill with test data
        large.fill(`test${i}`, 0, 100);

        // Use the fixed string conversion method (no slice)
        const small = large.toString("utf-8", 0, Math.min(1024, large.length));
        buffers.push(small);
      }

      // Force garbage collection
      if (global.gc) {
        global.gc();
      }

      const after = process.memoryUsage().heapUsed;
      const growth = after - baseline;

      // Should only have ~100KB in memory, not 1GB
      expect(growth).toBeLessThan(10 * 1024 * 1024); // Less than 10MB growth
    });

    it("should properly copy buffers in ImageMemoryManager", async () => {
      const imageManager = getImageMemoryManager();
      const baseline = process.memoryUsage().heapUsed;

      // Create a large buffer
      const largeBuffer = Buffer.alloc(20 * 1024 * 1024); // 20MB
      largeBuffer.fill("test");

      // Store in cache (should create a copy)
      const success = await imageManager.set("test-key", largeBuffer, {
        contentType: "image/png",
        source: "origin",
      });

      expect(success).toBe(true);

      // Original buffer should be garbage collectable
      const slicedBuffer = largeBuffer.subarray(0, 100);

      // Force GC
      if (global.gc) {
        global.gc();
      }

      // Verify the cached buffer is independent
      const cached = await imageManager.get("test-key");
      expect(cached).not.toBeNull();
      expect(cached?.buffer).not.toBe(largeBuffer);
    });
  });

  describe("Memory Budget Enforcement", () => {
    it("should reject oversized buffers", async () => {
      const imageManager = getImageMemoryManager();

      // Try to store a buffer larger than MAX_IMAGE_SIZE_BYTES
      const oversizedBuffer = Buffer.alloc(15 * 1024 * 1024); // 15MB

      const success = await imageManager.set("oversized", oversizedBuffer, {
        contentType: "image/png",
        source: "origin",
      });

      expect(success).toBe(false);
    });

    it("should evict old entries when budget exceeded", async () => {
      const imageManager = getImageMemoryManager();

      // Fill cache to near budget
      for (let i = 0; i < 15; i++) {
        const buffer = Buffer.alloc(8 * 1024 * 1024); // 8MB each
        await imageManager.set(`buffer-${i}`, buffer, {
          contentType: "image/png",
          source: "origin",
        });
      }

      // First entries should be evicted
      const firstEntry = await imageManager.get("buffer-0");
      expect(firstEntry).toBeNull();

      // Recent entries should still exist
      const recentEntry = await imageManager.get("buffer-14");
      expect(recentEntry).not.toBeNull();
    });
  });

  describe("Request Coalescing", () => {
    it("should prevent duplicate fetches for same image", async () => {
      const imageService = getUnifiedImageService();
      let fetchCount = 0;

      // Mock the fetch function
      jest.spyOn(imageService as any, "fetchAndProcess").mockImplementation(async () => {
        fetchCount++;
        // Simulate network delay
        await new Promise((resolve) => setTimeout(resolve, 100));
        return {
          buffer: Buffer.from("test-image"),
          contentType: "image/png",
        };
      });

      // Make 10 concurrent requests for the same image
      const promises = Array(10)
        .fill(0)
        .map(() => imageService.getImage("https://example.com/logo.png"));

      const results = await Promise.all(promises);

      // Should only have made one actual fetch
      expect(fetchCount).toBe(1);

      // All results should be the same
      results.forEach((result) => {
        expect(result.contentType).toBe("image/png");
      });
    });
  });

  describe("Memory Pressure Handling", () => {
    it("should reject new operations under memory pressure", async () => {
      const imageManager = getImageMemoryManager();
      const memoryMonitor = getMemoryHealthMonitor();

      // Simulate memory pressure by filling the cache
      for (let i = 0; i < 20; i++) {
        const buffer = Buffer.alloc(6 * 1024 * 1024); // 6MB each
        await imageManager.set(`pressure-test-${i}`, buffer, {
          contentType: "image/png",
          source: "origin",
        });
      }

      // Check if memory pressure is detected
      const metrics = imageManager.getMetrics();
      expect(metrics.memoryPressure).toBe(true);

      // New operations should be rejected
      const newBuffer = Buffer.alloc(1024 * 1024); // 1MB
      const success = await imageManager.set("should-fail", newBuffer, {
        contentType: "image/png",
        source: "origin",
      });

      expect(success).toBe(false);
    });

    it("should trigger emergency cleanup in critical state", async () => {
      const memoryMonitor = getMemoryHealthMonitor();

      // Spy on emergency cleanup
      const cleanupSpy = jest.spyOn(memoryMonitor, "emergencyCleanup");

      // Force critical state by manipulating the monitor
      (memoryMonitor as any).status = "critical";

      // Trigger status change event
      memoryMonitor.emit("status-changed", {
        previous: "warning",
        current: "critical",
        health: memoryMonitor.getHealthStatus(),
      });

      // Wait for cleanup to be scheduled
      await new Promise((resolve) => setTimeout(resolve, 6000));

      expect(cleanupSpy).toHaveBeenCalled();
    });
  });

  describe("Async Operations Integration", () => {
    it("should track image operations in AsyncOperationsMonitor", async () => {
      const imageService = getUnifiedImageService();

      // Start monitoring async operations
      const summaryBefore = asyncMonitor.getSummary();

      // Perform an image operation
      await imageService.getLogo("example.com", { invertColors: true });

      // Check that operation was tracked
      const summaryAfter = asyncMonitor.getSummary();
      expect(summaryAfter.total).toBeGreaterThan(summaryBefore.total);
    });

    it("should timeout long-running operations", async () => {
      const imageService = getUnifiedImageService();

      // Mock a slow operation
      jest.spyOn(imageService as any, "_getLogoInternal").mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 40000)); // 40s delay
        return { domain: "test.com", timestamp: Date.now() };
      });

      // Should timeout after 30s
      await expect(imageService.getLogo("slow.com")).rejects.toThrow(/timed out/);
    });
  });

  describe("ServerCache Buffer Protection", () => {
    it("should reject large buffers in ServerCache", () => {
      const largeBuffer = Buffer.alloc(15 * 1024 * 1024); // 15MB

      // Try to cache a large buffer
      ServerCacheInstance.set("large-buffer", largeBuffer);

      // Should have been rejected
      const retrieved = ServerCacheInstance.get("large-buffer");
      expect(retrieved).toBeUndefined();
    });

    it("should enforce max keys limit", () => {
      // Fill cache to max
      for (let i = 0; i < 100010; i++) {
        ServerCacheInstance.set(`key-${i}`, { data: i });
      }

      // Should have performed batch eviction
      const stats = ServerCacheInstance.getStats();
      expect(stats.keys).toBeLessThanOrEqual(100000);
    });
  });

  describe("Health Check Endpoints", () => {
    it("should return healthy status under normal conditions", () => {
      const monitor = getMemoryHealthMonitor();
      const health = monitor.getHealthStatus();

      expect(health.status).toBe("healthy");
      expect(health.statusCode).toBe(200);
    });

    it("should return degraded status in warning state", () => {
      const monitor = getMemoryHealthMonitor();
      (monitor as any).status = "warning";

      const health = monitor.getHealthStatus();

      expect(health.status).toBe("degraded");
      expect(health.statusCode).toBe(200); // Still healthy for LB
    });

    it("should return unhealthy status in critical state", () => {
      const monitor = getMemoryHealthMonitor();
      (monitor as any).status = "critical";

      const health = monitor.getHealthStatus();

      expect(health.status).toBe("unhealthy");
      expect(health.statusCode).toBe(503);
    });
  });

  describe("Memory Trend Analysis", () => {
    it("should detect increasing memory trend", () => {
      const monitor = getMemoryHealthMonitor();

      // Simulate increasing memory usage
      const history = (monitor as any).metricsHistory;
      for (let i = 0; i < 10; i++) {
        history.push({
          timestamp: Date.now() + i * 1000,
          rss: 100 * 1024 * 1024 + i * 10 * 1024 * 1024, // Increasing
          heapUsed: 50 * 1024 * 1024,
          heapTotal: 200 * 1024 * 1024,
          external: 0,
          arrayBuffers: 0,
          imageCacheSize: 0,
          imageCacheBytes: 0,
          serverCacheKeys: 0,
        });
      }

      const trend = monitor.getMemoryTrend();
      expect(trend).toBe("increasing");
    });
  });
});

// Test for heap snapshot comparison (requires special setup)
describe("Heap Snapshot Analysis", () => {
  it.skip("should not show memory growth after operations", () => {
    // This test requires --expose-gc flag and heap snapshot capabilities
    // Typically run in CI environment with special configuration

    if (!global.gc) {
      console.log("Skipping heap snapshot test - gc not available");
      return;
    }

    // Implementation would use v8.writeHeapSnapshot() or similar
    // to compare heap before and after operations
  });
});
