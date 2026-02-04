// Vitest provides describe, it, expect, beforeEach, afterEach, beforeAll, afterAll globally
import { ServerCacheInstance } from "@/lib/server-cache";
import type { CacheStats } from "@/types/cache";

describe("ServerCache Initialization", () => {
  it("should initialize with empty stats", () => {
    const stats: CacheStats = ServerCacheInstance.getStats();
    expect(stats).toBeDefined();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.keys).toBe(0);
  });

  it("should have a getStats method", () => {
    expect(typeof ServerCacheInstance.getStats).toBe("function");
  });
});
