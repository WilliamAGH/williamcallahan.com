/**
 * @fileoverview Tests for MemoryHealthMonitor image-operations guard
 * @jest-environment node
 */

jest.mock("@/lib/constants", () => ({
  MEMORY_THRESHOLDS: {
    TOTAL_PROCESS_MEMORY_BUDGET_BYTES: 1000,
    IMAGE_RAM_BUDGET_BYTES: 0,
    SERVER_CACHE_BUDGET_BYTES: 0,
    MEMORY_WARNING_THRESHOLD: 700,
    MEMORY_CRITICAL_THRESHOLD: 900,
    IMAGE_STREAM_THRESHOLD_BYTES: 0,
  },
}));

jest.mock("@/lib/server-cache", () => ({
  ServerCacheInstance: {
    getStats: jest.fn(() => ({
      keys: 0,
      hits: 0,
      misses: 0,
      ksize: 0,
      vsize: 0,
      sizeBytes: 0,
      maxSizeBytes: 0,
      utilizationPercent: 0,
    })),
  },
}));

describe("MemoryHealthMonitor.shouldAllowImageOperations", () => {
  const originalMemoryUsage = process.memoryUsage;

  afterEach(() => {
    Object.defineProperty(process, "memoryUsage", {
      value: originalMemoryUsage,
      configurable: true,
    });
  });

  const setMemoryUsage = (rss: number) => {
    Object.defineProperty(process, "memoryUsage", {
      value: jest.fn(() => ({
        rss,
        heapTotal: 0,
        heapUsed: 0,
        external: 0,
        arrayBuffers: 0,
      })),
      configurable: true,
    });
  };

  it("returns false when memory is critical", async () => {
    setMemoryUsage(950);
    const { MemoryHealthMonitor } = await import("@/lib/health/memory-health-monitor");
    const monitor = new MemoryHealthMonitor();
    expect(monitor.shouldAllowImageOperations()).toBe(false);
  });

  it("returns true when memory is healthy", async () => {
    setMemoryUsage(500);
    const { MemoryHealthMonitor } = await import("@/lib/health/memory-health-monitor");
    const monitor = new MemoryHealthMonitor();
    expect(monitor.shouldAllowImageOperations()).toBe(true);
  });
});
