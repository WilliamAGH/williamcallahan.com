import { ServerCache } from '../../lib/server-cache';
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
    ServerCache.clear();
  });

  describe('logo validation', () => {
    it('should store and retrieve logo validation results', () => {
      const imageHash = 'test-hash';
      const isGlobeIcon = true;

      ServerCache.setLogoValidation(imageHash, isGlobeIcon);
      const result = ServerCache.getLogoValidation(imageHash);

      expect(result).toBeDefined();
      expect(result?.isGlobeIcon).toBe(isGlobeIcon);
      expect(result?.timestamp).toBeLessThanOrEqual(Date.now());
    });

    it('should return undefined for non-existent validation', () => {
      const result = ServerCache.getLogoValidation('non-existent');
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

      ServerCache.setLogoFetch(domain, mockFetchResult);
      const result = ServerCache.getLogoFetch(domain);

      expect(result).toBeDefined();
      expect(result?.url).toBe(mockFetchResult.url);
      expect(result?.source).toBe(mockFetchResult.source);
      expect(result?.buffer).toEqual(mockFetchResult.buffer);
      expect(result?.timestamp).toBeLessThanOrEqual(Date.now());
    });

    it('should clear logo fetch cache for specific domain', () => {
      const domain = 'example.com';

      ServerCache.setLogoFetch(domain, mockFetchResult);
      ServerCache.clearLogoFetch(domain);

      const result = ServerCache.getLogoFetch(domain);
      expect(result).toBeUndefined();
    });

    it('should clear all logo fetch caches', () => {
      const domains = ['example1.com', 'example2.com'];

      domains.forEach(domain => {
        ServerCache.setLogoFetch(domain, mockFetchResult);
      });

      ServerCache.clearAllLogoFetches();

      domains.forEach(domain => {
        const result = ServerCache.getLogoFetch(domain);
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

      ServerCache.setInvertedLogo(key, buffer, mockAnalysis);
      const result = ServerCache.getInvertedLogo(key);

      expect(result).toBeDefined();
      expect(result?.buffer).toEqual(buffer);
      expect(result?.analysis).toEqual(mockAnalysis);
      expect(result?.timestamp).toBeLessThanOrEqual(Date.now());
    });

    it('should return undefined for non-existent inverted logo', () => {
      const result = ServerCache.getInvertedLogo('non-existent');
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

      ServerCache.setLogoAnalysis(key, mockAnalysis);
      const result = ServerCache.getLogoAnalysis(key);

      expect(result).toEqual(mockAnalysis);
    });

    it('should return undefined for non-existent analysis', () => {
      const result = ServerCache.getLogoAnalysis('non-existent');
      expect(result).toBeUndefined();
    });
  });

  describe('cache management', () => {
    it('should clear all caches', () => {
      // Set some test data
      ServerCache.setLogoValidation('test-hash', true);
      ServerCache.setLogoFetch('example.com', {
        url: 'https://example.com/logo.png',
        source: 'google' as LogoSource
      });

      ServerCache.clear();

      expect(ServerCache.getLogoValidation('test-hash')).toBeUndefined();
      expect(ServerCache.getLogoFetch('example.com')).toBeUndefined();
    });

    it('should get cache statistics', () => {
      ServerCache.setLogoValidation('test-hash', true);
      ServerCache.setLogoFetch('example.com', {
        url: 'https://example.com/logo.png',
        source: 'google' as LogoSource
      });

      const stats = ServerCache.getStats();
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
      ServerCache.setLogoValidation(key, true);
      expect(ServerCache.getLogoValidation(key)).toBeDefined();

      // Advance time just before TTL expiration
      jest.spyOn(Date, 'now').mockImplementation(() => startTime + (SERVER_CACHE_DURATION * 1000) - 1);
      expect(ServerCache.getLogoValidation(key)).toBeDefined();

      // Advance time past TTL expiration
      jest.spyOn(Date, 'now').mockImplementation(() => startTime + (SERVER_CACHE_DURATION * 1000) + 1);
      expect(ServerCache.getLogoValidation(key)).toBeUndefined();

      // Restore Date.now
      jest.spyOn(Date, 'now').mockRestore();
    });
  });
});
