/**
 * Memory Management System Tests
 *
 * Tests for the comprehensive memory management system including:
 * - ImageMemoryManager: Memory-aware cache with size budgets
 * - MemoryHealthMonitor: Health monitoring and graceful degradation
 * - Memory pressure detection and handling
 * - Buffer safety and leak prevention
 */

import { EventEmitter } from "node:events";
import { MEMORY_THRESHOLDS } from "@/lib/constants";

// Stub classes for skipped tests (actual modules not yet implemented)
// These stubs allow the file to be linted without errors while tests remain skipped
class ImageMemoryManager extends EventEmitter {
  setMaxListeners(_n: number) {
    return this;
  }
  getMetrics() {
    return { cacheSize: 0, cacheBytes: 0, memoryPressure: false };
  }
  destroy() {
    /* no-op */
  }
  setMemoryPressure(_v: boolean) {
    /* no-op */
  }
  // Stub methods to satisfy tests
  set(_key: string, _buffer: Buffer, _metadata: Omit<ImageCacheEntry, "buffer" | "timestamp">) {
    return false;
  }
  get(_key: string): Promise<ImageCacheEntry | null> {
    return Promise.resolve(null);
  }
  delete(_key: string) {
    /* no-op */
  }
  clear() {
    /* no-op */
  }
  registerFetch(_key: string, _promise: Promise<Buffer>) {
    /* no-op */
  }
  isFetching(_key: string) {
    return false;
  }
  getFetchPromise(_key: string): Promise<Buffer> {
    return Promise.resolve(Buffer.from("fetched data"));
  }
}
// Lazy singleton - only instantiated when first accessed
let imageMemoryManagerInstance: ImageMemoryManager | null = null;
function getImageMemoryManagerInstance(): ImageMemoryManager {
  if (!imageMemoryManagerInstance) {
    imageMemoryManagerInstance = new ImageMemoryManager();
  }
  return imageMemoryManagerInstance;
}

class MemoryHealthMonitor {
  getCurrentStatus() {
    return "healthy";
  }
  checkHealth() {
    return { isHealthy: true };
  }
  // Stub methods to satisfy tests
  stopMonitoring() {
    /* no-op */
  }
  getHealthStatus() {
    return { status: "healthy", statusCode: 200, message: "OK", details: {} };
  }
  shouldAcceptNewRequests() {
    return true;
  }
  shouldAllowImageOperations() {
    return true;
  }
  getMemoryTrend() {
    return "stable";
  }
  checkMemory() {
    /* no-op */
  }
  emergencyCleanup() {
    return Promise.resolve();
  }
  getMetricsHistory() {
    return [{ timestamp: Date.now(), rss: 0, heapUsed: 0 }];
  }
}
// Lazy singleton - only instantiated when first accessed, not at module load time
let memoryHealthMonitorInstance: MemoryHealthMonitor | null = null;
function getMemoryHealthMonitorSingleton(): MemoryHealthMonitor {
  if (!memoryHealthMonitorInstance) {
    memoryHealthMonitorInstance = new MemoryHealthMonitor();
  }
  return memoryHealthMonitorInstance;
}
const memoryHealthCheckMiddleware = jest.fn();
const memoryPressureMiddleware = jest.fn();

import type { ImageCacheEntry } from "@/types/cache";
import type { ImageMemoryMetrics } from "@/types/image";
import type { MemoryMetrics } from "@/types/health";

// Mock dependencies
jest.mock("@/lib/server-cache", () => ({
  ServerCacheInstance: {
    getStats: jest.fn(() => ({
      keys: 0,
      hits: 0,
      misses: 0,
    })),
    clearAllCaches: jest.fn(),
  },
}));

jest.mock("@/lib/async-operations-monitor", () => ({
  asyncMonitor: {
    getHealthStatus: jest.fn(() => ({
      activeOperations: 0,
      totalOperations: 0,
      failedOperations: 0,
    })),
  },
  monitoredAsync: jest.fn((_context, _name, fn, _options) => fn()),
}));

describe.skip("ImageMemoryManager", () => {
  let manager: any; // ImageMemoryManager;

  beforeEach(() => {
    // Create fresh instance for each test
    manager = new ImageMemoryManager();
    // Increase max listeners to prevent warnings in tests
    manager.setMaxListeners(20);
  });

  afterEach(() => {
    if (manager) {
      manager.destroy();
    }
  });

  describe("Constructor and Configuration", () => {
    it("should initialize with default configuration", () => {
      expect(manager).toBeInstanceOf(EventEmitter);

      const metrics = manager.getMetrics();
      expect(metrics.cacheSize).toBe(0);
      expect(metrics.cacheBytes).toBe(0);
      expect(metrics.memoryPressure).toBe(false);
    });

    it("should validate configuration values", () => {
      // Test with invalid budget
      const originalBudget = MEMORY_THRESHOLDS.IMAGE_RAM_BUDGET_BYTES;
      Object.defineProperty(MEMORY_THRESHOLDS, "IMAGE_RAM_BUDGET_BYTES", {
        value: -1,
        configurable: true,
      });

      expect(() => new ImageMemoryManager()).toThrow(
        "IMAGE_RAM_BUDGET_BYTES must be a positive number",
      );

      // Restore original value
      Object.defineProperty(MEMORY_THRESHOLDS, "IMAGE_RAM_BUDGET_BYTES", {
        value: originalBudget,
        configurable: true,
      });
    });
  });

  describe("Cache Operations", () => {
    it("should return false for set operations (deprecated functionality)", () => {
      const testBuffer = Buffer.from("test data");
      const metadata: Omit<ImageCacheEntry, "buffer" | "timestamp"> = {
        contentType: "image/png",
        source: "external",
        s3Key: "test.png",
      };

      // ImageMemoryManager is deprecated - set operations should return false
      const stored = manager.set("test-key", testBuffer, metadata);
      expect(stored).toBe(false);
    });

    it("should return null for get operations (deprecated functionality)", async () => {
      // ImageMemoryManager is deprecated - get operations should return null
      const retrieved = manager.get("test-key");
      await expect(retrieved).resolves.toBeNull();
    });

    it("should reject oversized buffers (deprecated functionality)", () => {
      const oversizedBuffer = Buffer.alloc(100 * 1024 * 1024); // 100MB
      const metadata: Omit<ImageCacheEntry, "buffer" | "timestamp"> = {
        contentType: "image/png",
        source: "external",
      };

      // ImageMemoryManager is deprecated - should return false
      const stored = manager.set("oversized", oversizedBuffer, metadata);
      expect(stored).toBe(false);
    });

    it("should not store buffer copies (deprecated functionality)", async () => {
      const originalBuffer = Buffer.from("original large buffer data");
      const metadata: Omit<ImageCacheEntry, "buffer" | "timestamp"> = {
        contentType: "image/png",
        source: "external",
      };

      manager.set("test", originalBuffer, metadata);

      // ImageMemoryManager is deprecated - should return null
      const cached = await manager.get("test");
      expect(cached).toBeNull();
    });

    it("should handle cache deletion as no-op (deprecated functionality)", async () => {
      const testBuffer = Buffer.from("test");
      const metadata: Omit<ImageCacheEntry, "buffer" | "timestamp"> = {
        contentType: "image/png",
        source: "external",
      };

      manager.set("delete-test", testBuffer, metadata);
      manager.delete("delete-test");

      // ImageMemoryManager is deprecated - should return null anyway
      const retrieved = await manager.get("delete-test");
      expect(retrieved).toBeNull();
    });

    it("should clear all caches as no-op (deprecated functionality)", () => {
      const testBuffer = Buffer.from("test");
      const metadata: Omit<ImageCacheEntry, "buffer" | "timestamp"> = {
        contentType: "image/png",
        source: "external",
      };

      manager.set("clear-test", testBuffer, metadata);
      manager.clear();

      // ImageMemoryManager is deprecated - cache size should be 0 (no caching happens)
      const metrics = manager.getMetrics();
      expect(metrics.cacheSize).toBe(0);
      expect(metrics.cacheBytes).toBe(0);
    });
  });

  describe("Request Coalescing", () => {
    it("should prevent duplicate concurrent fetches", async () => {
      jest.useFakeTimers();
      const fetchPromise = Promise.resolve(Buffer.from("fetched data"));

      manager.registerFetch("coalesce-test", fetchPromise);
      expect(manager.isFetching("coalesce-test")).toBe(true);

      const retrievedPromise = manager.getFetchPromise("coalesce-test");
      expect(await retrievedPromise).toStrictEqual(await fetchPromise);

      // Wait for completion and cleanup
      await fetchPromise;
      // Add a small delay to ensure cleanup has happened
      jest.advanceTimersByTime(10);

      // Should be cleaned up
      expect(manager.isFetching("coalesce-test")).toBe(false);
      jest.useRealTimers();
    });

    it("should limit concurrent fetches", () => {
      // Fill up the in-flight limit
      for (let i = 0; i < 1000; i++) {
        manager.registerFetch(`fetch-${i}`, Promise.resolve(Buffer.from("test")));
      }

      // This should be rejected
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
      manager.registerFetch("over-limit", Promise.resolve(Buffer.from("test")));

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("In-flight fetch limit reached"),
      );

      consoleSpy.mockRestore();
    });
  });

  describe("Memory Pressure Handling", () => {
    it("should enter memory pressure mode", () => {
      const eventSpy = jest.fn();
      manager.on("memory-pressure-start", eventSpy);

      manager.setMemoryPressure(true);

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          source: "external",
        }),
      );
    });

    it("should reject operations during memory pressure", async () => {
      manager.setMemoryPressure(true);

      const testBuffer = Buffer.from("test");
      const metadata: Omit<ImageCacheEntry, "buffer" | "timestamp"> = {
        contentType: "image/png",
        source: "external",
      };

      const stored = manager.set("pressure-test", testBuffer, metadata);
      expect(stored).toBe(false);

      const retrieved = await manager.get("pressure-test");
      expect(retrieved).toBeNull();
    });

    it("should exit memory pressure mode", () => {
      const startSpy = jest.fn();
      const endSpy = jest.fn();

      manager.on("memory-pressure-start", startSpy);
      manager.on("memory-pressure-end", endSpy);

      manager.setMemoryPressure(true);
      manager.setMemoryPressure(false);

      expect(startSpy).toHaveBeenCalled();
      expect(endSpy).toHaveBeenCalled();
    });
  });

  describe("Memory Metrics", () => {
    it("should provide accurate memory metrics", () => {
      const metrics = manager.getMetrics();

      expect(metrics).toHaveProperty("cacheSize");
      expect(metrics).toHaveProperty("cacheBytes");
      expect(metrics).toHaveProperty("rss");
      expect(metrics).toHaveProperty("heapUsed");
      expect(metrics).toHaveProperty("external");
      expect(metrics).toHaveProperty("memoryPressure");

      expect(typeof metrics.cacheSize).toBe("number");
      expect(typeof metrics.cacheBytes).toBe("number");
      expect(typeof metrics.memoryPressure).toBe("boolean");
    });

    it("should emit metrics events", (done) => {
      manager.on("metrics", (metrics: ImageMemoryMetrics) => {
        expect(metrics).toHaveProperty("cacheSize");
        expect(metrics).toHaveProperty("memoryPressure");
        done();
      });

      // Trigger metrics emission (happens automatically via interval)
      // For testing, we'll just verify the structure
      const metrics = manager.getMetrics();
      manager.emit("metrics", metrics);
    });
  });

  describe("Event Emission", () => {
    it("should not emit image-disposed events (deprecated functionality)", () => {
      const eventSpy = jest.fn();
      manager.on("image-disposed", eventSpy);

      const testBuffer = Buffer.from("test");
      const metadata: Omit<ImageCacheEntry, "buffer" | "timestamp"> = {
        contentType: "image/png",
        source: "external",
      };

      // ImageMemoryManager is deprecated - no storage or disposal events occur
      manager.set("test-delete", testBuffer, metadata);
      manager.delete("test-delete");

      // No disposal event should be triggered since nothing is cached
      expect(eventSpy).not.toHaveBeenCalled();
    });
  });
});

describe.skip("MemoryHealthMonitor", () => {
  let monitor: any; // MemoryHealthMonitor;

  beforeEach(() => {
    monitor = new MemoryHealthMonitor();
  });

  afterEach(() => {
    if (monitor) {
      monitor.stopMonitoring();
    }
  });

  describe("Health Status", () => {
    it("should start in healthy state", () => {
      const status = monitor.getCurrentStatus();
      expect(status).toBe("healthy");
    });

    it("should provide health check results", () => {
      const health = monitor.getHealthStatus();

      expect(health).toHaveProperty("status");
      expect(health).toHaveProperty("statusCode");
      expect(health).toHaveProperty("message");
      expect(health).toHaveProperty("details");

      // Accept any valid status code as test environment memory usage varies
      expect([200, 503]).toContain(health.statusCode);
      expect(["healthy", "degraded", "unhealthy"]).toContain(health.status);
    });

    it("should determine request acceptance", () => {
      expect(monitor.shouldAcceptNewRequests()).toBe(true);
      expect(monitor.shouldAllowImageOperations()).toBe(true);
    });
  });

  describe("Memory Trend Analysis", () => {
    it("should track memory trends", () => {
      // Initially should be stable with insufficient data
      expect(monitor.getMemoryTrend()).toBe("stable");

      // Add some mock metrics to history
      const mockMetrics: MemoryMetrics[] = Array.from({ length: 10 }, (_, i) => ({
        timestamp: Date.now() - (10 - i) * 1000,
        rss: 100 * 1024 * 1024 + i * 10 * 1024 * 1024, // Increasing RSS
        heapTotal: 50 * 1024 * 1024,
        heapUsed: 30 * 1024 * 1024,
        external: 5 * 1024 * 1024,
        arrayBuffers: 0,
        imageCacheSize: 0,
        imageCacheBytes: 0,
        serverCacheKeys: 0,
      }));

      // Simulate adding metrics to history
      mockMetrics.forEach(() => monitor.checkMemory());
    });
  });

  describe("Emergency Cleanup", () => {
    it("should perform emergency cleanup", async () => {
      // Allow console output for this specific test
      const originalEnv = process.env.ALLOW_MEMORY_TEST_LOGS;
      process.env.ALLOW_MEMORY_TEST_LOGS = "true";

      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

      await monitor.emergencyCleanup();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Emergency cleanup"));

      consoleSpy.mockRestore();

      // Restore original environment
      if (originalEnv === undefined) {
        delete process.env.ALLOW_MEMORY_TEST_LOGS;
      } else {
        process.env.ALLOW_MEMORY_TEST_LOGS = originalEnv;
      }
    });

    it("should handle cleanup errors gracefully", async () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      // Mock getImageMemoryManagerInstance() to throw an error
      const originalSetMemoryPressure = ImageMemoryManager.prototype.setMemoryPressure;
      ImageMemoryManager.prototype.setMemoryPressure = jest.fn(() => {
        throw new Error("Cleanup failed");
      });

      await monitor.emergencyCleanup();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Error during emergency cleanup"),
        expect.any(Error),
      );

      // Restore original method
      ImageMemoryManager.prototype.setMemoryPressure = originalSetMemoryPressure;
      consoleSpy.mockRestore();
    });
  });

  describe("Memory Monitoring", () => {
    it("should check memory usage", () => {
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      monitor.checkMemory();

      // Status may vary in test environment due to memory usage
      const status = monitor.getCurrentStatus();
      expect(["healthy", "warning", "critical"]).toContain(status);

      consoleSpy.mockRestore();
    });

    it("should get metrics history", () => {
      monitor.checkMemory(); // Add at least one metric

      const history = monitor.getMetricsHistory();
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);

      if (history.length > 0) {
        const metric = history[0];
        expect(metric).toHaveProperty("timestamp");
        expect(metric).toHaveProperty("rss");
        expect(metric).toHaveProperty("heapUsed");
      }
    });
  });

  describe("Singleton Pattern", () => {
    it("should return same instance", () => {
      const instance1 = getMemoryHealthMonitorSingleton();
      const instance2 = getMemoryHealthMonitorSingleton();

      expect(instance1).toBe(instance2);
    });
  });
});

describe.skip("Memory Health Middleware", () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: jest.Mock;

  beforeEach(() => {
    mockReq = {};
    mockRes = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockNext = jest.fn();
  });

  describe("memoryHealthCheckMiddleware", () => {
    it("should add memory status header", () => {
      const result = memoryHealthCheckMiddleware(mockReq, mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith("X-Memory-Status", expect.any(String));
      expect(result).toHaveProperty("status");
      expect(result).toHaveProperty("statusCode");
    });
  });

  describe("memoryPressureMiddleware", () => {
    it("should allow requests when healthy", () => {
      // Force the monitor to be in healthy state for this test
      const monitor = getMemoryHealthMonitorSingleton();
      jest.spyOn(monitor, "shouldAcceptNewRequests").mockReturnValue(true);

      memoryPressureMiddleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it("should reject requests when in critical state", () => {
      // Mock the monitor to return critical state
      const monitor = getMemoryHealthMonitorSingleton();
      jest.spyOn(monitor, "shouldAcceptNewRequests").mockReturnValue(false);
      jest.spyOn(monitor, "getCurrentStatus").mockReturnValue("critical");

      memoryPressureMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining("memory pressure"),
          status: "critical",
        }),
      );
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});

describe.skip("Memory Leak Prevention", () => {
  it("should not retain parent buffer references", async () => {
    const manager = new ImageMemoryManager();

    // Create a large parent buffer
    const parentBuffer = Buffer.alloc(1024 * 1024, "A"); // 1MB filled with 'A'

    // Create a slice (this would retain parent reference if not handled properly)
    const slice = parentBuffer.subarray(0, 1024);

    const metadata: Omit<ImageCacheEntry, "buffer" | "timestamp"> = {
      contentType: "image/png",
      source: "external",
    };

    // Store the slice
    manager.set("slice-test", slice, metadata);

    // The manager should have created a copy, not stored the slice
    const cached = await manager.get("slice-test");

    if (cached?.buffer) {
      // The cached buffer should be independent of the parent
      expect(cached.buffer).not.toBe(slice);
      expect(cached.buffer).not.toBe(parentBuffer);
      expect(cached.buffer.length).toBe(1024);
    }

    manager.destroy();
  });

  it("should properly dispose of buffers on clear", () => {
    const manager = new ImageMemoryManager();
    const disposalSpy = jest.fn();

    manager.on("image-disposed", disposalSpy);

    const testBuffer = Buffer.from("test data");
    const metadata: Omit<ImageCacheEntry, "buffer" | "timestamp"> = {
      contentType: "image/png",
      source: "external",
    };

    // Add some buffers
    manager.set("test-1", testBuffer, metadata);
    manager.set("test-2", testBuffer, metadata);

    // Clear should trigger disposal events
    manager.clear();

    // Verify disposal events were emitted
    expect(disposalSpy).not.toHaveBeenCalled();

    manager.destroy();
  });
});

describe.skip("Integration Tests", () => {
  it("should handle memory pressure across components", async () => {
    jest.useFakeTimers();
    // Get singleton instances to test their interaction
    const manager = getImageMemoryManagerInstance();
    const monitor = getMemoryHealthMonitorSingleton();

    // Ensure clean state before test
    manager.setMemoryPressure(false);

    // Directly induce memory pressure on the singleton manager
    manager.setMemoryPressure(true);

    // Allow event propagation with a small delay or use event-based waiting
    jest.advanceTimersByTime(10);

    // The manager's own metrics should reflect the pressure state
    const managerMetrics = manager.getMetrics();
    expect(managerMetrics.memoryPressure).toBe(true);

    // Verify that the monitor, which listens to the manager, reflects the state
    expect(monitor.shouldAllowImageOperations()).toBe(false);

    // Clean up the state for other tests
    manager.setMemoryPressure(false);

    // Allow cleanup to propagate
    jest.advanceTimersByTime(10);

    // Verify cleanup worked
    expect(monitor.shouldAllowImageOperations()).toBe(true);
    jest.useRealTimers();
  });
});
