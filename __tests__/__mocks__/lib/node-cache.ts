/**
 * Mock implementation of node-cache for testing
 * This mock is used to test the server-side cache by providing a mock implementation of the NodeCache class which is used in the lib/server-cache.ts file and is used to cache the results of the getLogo function
 */
class MockNodeCache {
  private cache: Map<string, any> = new Map();
  private ttls: Map<string, number> = new Map();
  private options: Record<string, any>;

  constructor(options: Record<string, any> = {}) {
    this.options = {
      stdTTL: 0,
      checkperiod: 600,
      useClones: true,
      deleteOnExpire: true,
      ...options
    };
  }

  get<T>(key: string): T | undefined {
    if (this.has(key)) {
      return this.cache.get(key) as T;
    }
    return undefined;
  }

  set<T>(key: string, value: T, ttl?: number): boolean {
    this.cache.set(key, value);
    if (ttl !== undefined) {
      this.ttls.set(key, ttl);
    }
    return true;
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  del(key: string | string[]): number {
    if (typeof key === 'string') {
      const success = this.cache.delete(key);
      this.ttls.delete(key);
      return success ? 1 : 0;
    }

    let count = 0;
    for (const k of key) {
      count += this.del(k);
    }
    return count;
  }

  flushAll(): void {
    this.cache.clear();
    this.ttls.clear();
  }

  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  getStats(): any {
    return {
      keys: this.cache.size,
      hits: 0,
      misses: 0,
      ksize: 0,
      vsize: 0
    };
  }
}

export default MockNodeCache;