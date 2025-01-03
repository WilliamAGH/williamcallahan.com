import { ServerCacheInstance } from '../../lib/server-cache';
import type { LogoInversion, LogoSource } from '../../types/logo';
import { SERVER_CACHE_DURATION } from '../../lib/constants';

// Mock NodeCache
jest.mock('node-cache', () => {
  return jest.fn().mockImplementation(() => {
    let store = new Map();
    let ttls = new Map();

    return {
      get: jest.fn(key => {
        const now = Date.now();
        const ttl = ttls.get(key);

        // Check if TTL has expired
        if (ttl && now >= ttl) {
          store.delete(key);
          ttls.delete(key);
          return undefined;
        }

        return store.get(key);
      }),
      set: jest.fn((key, value) => {
        store.set(key, value);
        ttls.set(key, Date.now() + SERVER_CACHE_DURATION * 1000);
        return true;
      }),
      del: jest.fn(key => {
        store.delete(key);
        ttls.delete(key);
      }),
      flushAll: jest.fn(() => {
        store.clear();
        ttls.clear();
      }),
      keys: jest.fn(() => Array.from(store.keys())),
      getStats: jest.fn(() => ({
        keys: store.size,
        hits: 0,
        misses: 0
      }))
    };
  });
});

describe('ServerCache', () => {
  beforeEach(() => {
    ServerCacheInstance.clear();
  });

  describe('logo validation', () => {
    it('should store and retrieve logo validation results', () => {
      const imageHash = 'test-hash';
      const isGlobeIcon = true;

      ServerCacheInstance.setLogoValidation(imageHash, isGlobeIcon);
      const result = ServerCacheInstance.getLogoValidation(imageHash);

      expect(result).toBeDefined();
      expect(result?.isGlobeIcon).toBe(isGlobeIcon);
      expect(result?.timestamp).toBeLessThanOrEqual(Date.now());
    });

    it('should return undefined for non-existent validation', () => {
      const result = ServerCacheInstance.getLogoValidation('non-existent');
      expect(result).toBeUndefined();
    });
  });

  describe('logo fetch', () => {
    const mockFetchResult = {
      url: 'https://example.com/logo.png',
      source: 'google' as LogoSource,
      buffer: Buffer.from('test'),
    };

    it('should store and retrieve logo fetch results', () => {
      const domain = 'example.com';

      ServerCacheInstance.setLogoFetch(domain, mockFetchResult);
      const result = ServerCacheInstance.getLogoFetch(domain);

      expect(result).toBeDefined();
      expect(result?.url).toBe(mockFetchResult.url);
      expect(result?.source).toBe(mockFetchResult.source);
      expect(result?.buffer).toEqual(mockFetchResult.buffer);
      expect(result?.timestamp).toBeLessThanOrEqual(Date.now());
    });

    it('should clear logo fetch cache for specific domain', () => {
      const domain = 'example.com';

      ServerCacheInstance.setLogoFetch(domain, mockFetchResult);
      ServerCacheInstance.clearLogoFetch(domain);

      const result = ServerCacheInstance.getLogoFetch(domain);
      expect(result).toBeUndefined();
    });

    it('should clear all logo fetch caches', () => {
      const domains = ['example1.com', 'example2.com'];

      domains.forEach(domain => {
        ServerCacheInstance.setLogoFetch(domain, mockFetchResult);
      });

      ServerCacheInstance.clearAllLogoFetches();

      domains.forEach(domain => {
        const result = ServerCacheInstance.getLogoFetch(domain);
        expect(result).toBeUndefined();
      });
    });
  });

  describe('inverted logo', () => {
    const mockAnalysis: LogoInversion = {
      needsDarkInversion: true,
      needsLightInversion: false,
      hasTransparency: true,
      brightness: 128
    };

    it('should store and retrieve inverted logos', () => {
      const key = 'test-key';
      const buffer = Buffer.from('test-inverted');

      ServerCacheInstance.setInvertedLogo(key, buffer, mockAnalysis);
      const result = ServerCacheInstance.getInvertedLogo(key);

      expect(result).toBeDefined();
      expect(result?.buffer).toEqual(buffer);
      expect(result?.analysis).toEqual(mockAnalysis);
      expect(result?.timestamp).toBeLessThanOrEqual(Date.now());
    });

    it('should return undefined for non-existent inverted logo', () => {
      const result = ServerCacheInstance.getInvertedLogo('non-existent');
      expect(result).toBeUndefined();
    });
  });

  describe('logo analysis', () => {
    const mockAnalysis: LogoInversion = {
      needsDarkInversion: true,
      needsLightInversion: false,
      hasTransparency: true,
      brightness: 128
    };

    it('should store and retrieve logo analysis', () => {
      const key = 'test-key';

      ServerCacheInstance.setLogoAnalysis(key, mockAnalysis);
      const result = ServerCacheInstance.getLogoAnalysis(key);

      expect(result).toEqual(mockAnalysis);
    });

    it('should return undefined for non-existent analysis', () => {
      const result = ServerCacheInstance.getLogoAnalysis('non-existent');
      expect(result).toBeUndefined();
    });
  });

  describe('cache management', () => {
    it('should clear all caches', () => {
      // Set some test data
      ServerCacheInstance.setLogoValidation('test-hash', true);
      ServerCacheInstance.setLogoFetch('example.com', {
        url: 'https://example.com/logo.png',
        source: 'google' as LogoSource
      });

      ServerCacheInstance.clear();

      expect(ServerCacheInstance.getLogoValidation('test-hash')).toBeUndefined();
      expect(ServerCacheInstance.getLogoFetch('example.com')).toBeUndefined();
    });

    it('should get cache statistics', () => {
      ServerCacheInstance.setLogoValidation('test-hash', true);
      ServerCacheInstance.setLogoFetch('example.com', {
        url: 'https://example.com/logo.png',
        source: 'google' as LogoSource
      });

      const stats = ServerCacheInstance.getStats();
      expect(stats.keys).toBe(2);
      expect(typeof stats.hits).toBe('number');
      expect(typeof stats.misses).toBe('number');
    });

    it('should respect TTL setting', () => {
      const key = 'ttl-test';

      // Set initial time
      const startTime = 1000000;
      jest.spyOn(Date, 'now').mockImplementation(() => startTime);

      // Set cache entry
      ServerCacheInstance.setLogoValidation(key, true);
      expect(ServerCacheInstance.getLogoValidation(key)).toBeDefined();

      // Advance time just before TTL expiration
      jest.spyOn(Date, 'now').mockImplementation(() => startTime + (SERVER_CACHE_DURATION * 1000) - 1);
      expect(ServerCacheInstance.getLogoValidation(key)).toBeDefined();

      // Advance time past TTL expiration
      jest.spyOn(Date, 'now').mockImplementation(() => startTime + (SERVER_CACHE_DURATION * 1000) + 1);
      expect(ServerCacheInstance.getLogoValidation(key)).toBeUndefined();

      // Restore Date.now
      jest.spyOn(Date, 'now').mockRestore();
    });
  });
});
