import { cache, CACHE_TTL } from "@/lib/cache";
import type { CacheStats } from "@/types/cache";

describe("lib/cache", () => {
  beforeEach(() => {
    cache.flushAll();
  });

  it("should set and get a value", () => {
    cache.set("key", "value");
    const value = cache.get("key");
    expect(value).toBe("value");
  });

  it("should delete a value", () => {
    cache.set("key", "value");
    cache.del("key");
    const value = cache.get("key");
    expect(value).toBeUndefined();
  });

  it("should expire a value after its TTL", (done) => {
    cache.set("key", "value", 1); // 1 second TTL
    setTimeout(() => {
      const value = cache.get("key");
      expect(value).toBeUndefined();
      done();
    }, 1100);
  });

  it("should flush all values", () => {
    cache.set("key1", "value1");
    cache.set("key2", "value2");
    cache.flushAll();
    expect(cache.get("key1")).toBeUndefined();
    expect(cache.get("key2")).toBeUndefined();
  });

  it("should provide cache stats", () => {
    cache.set("key1", "value1");
    cache.get("key1"); // hit
    cache.get("key2"); // miss

    const stats: CacheStats = cache.getStats();
    expect(stats.keys).toBe(1);
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
  });

  it("should have correct CACHE_TTL constants", () => {
    expect(CACHE_TTL.DEFAULT).toBe(30 * 24 * 60 * 60);
    expect(CACHE_TTL.DAILY).toBe(24 * 60 * 60);
    expect(CACHE_TTL.HOURLY).toBe(60 * 60);
  });
});
