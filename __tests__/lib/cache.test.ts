import { cache } from "@/lib/cache";

describe("cache", () => {
  beforeEach(() => {
    cache.flushAll();
  });

  it("should store and retrieve values", () => {
    const key = "test-key";
    const value = { data: "test-value" };

    cache.set(key, value);
    const retrieved = cache.get(key);

    expect(retrieved).toEqual(value);
  });

  it("should handle non-existent keys", () => {
    const retrieved = cache.get("non-existent");
    expect(retrieved).toBeUndefined();
  });

  it("should respect TTL", async () => {
    const key = "ttl-test";
    const value = "test-value";

    // Set with 1 second TTL
    cache.set(key, value, 1);

    // Value should exist immediately
    expect(cache.get(key)).toBe(value);

    // Wait for TTL to expire
    await new Promise((resolve) => setTimeout(resolve, 1100));

    // Value should be gone
    expect(cache.get(key)).toBeUndefined();
  });

  it("should not clone stored objects", () => {
    const key = "object-test";
    const value = { nested: { data: "test" } };
    type TestValue = typeof value;

    cache.set(key, value);
    const retrieved = cache.get<TestValue>(key);

    // Modify the retrieved object
    if (retrieved) {
      retrieved.nested.data = "modified";
    }

    // Original cached value should also be modified due to useClones: false
    const retrievedAgain = cache.get<TestValue>(key);
    expect(retrievedAgain?.nested.data).toBe("modified");
  });

  it("should delete keys", () => {
    const key = "delete-test";
    const value = "test-value";

    cache.set(key, value);
    expect(cache.get(key)).toBe(value);

    cache.del(key);
    expect(cache.get(key)).toBeUndefined();
  });

  it("should flush all keys", () => {
    cache.set("key1", "value1");
    cache.set("key2", "value2");

    cache.flushAll();

    expect(cache.get("key1")).toBeUndefined();
    expect(cache.get("key2")).toBeUndefined();
  });

  it("should get statistics", () => {
    cache.set("key1", "value1");
    cache.set("key2", "value2");

    const stats = cache.getStats();

    expect(stats.keys).toBe(2);
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
  });
});
