import { describe, test, expect, mock, beforeAll, jest } from 'bun:test';

// First, mock the modules before requiring our target module
void mock.module('../../lib/utils/ensure-server-only', () => ({
  assertServerOnly: jest.fn(),
}));

// Now import the server cache module directly
import { ServerCacheInstance } from '../../lib/server-cache';

describe('ServerCache Basic Tests', () => {
  beforeAll(() => {
    // Verify that the ServerCache instance exists and is properly initialized
    if (!ServerCacheInstance) {
      throw new Error('ServerCacheInstance is not defined');
    }
  });

  test('should have basic cache functionality', () => {
    // Test if all expected methods exist
    expect(typeof ServerCacheInstance.get).toBe('function');
    expect(typeof ServerCacheInstance.set).toBe('function');
    expect(typeof ServerCacheInstance.del).toBe('function');
    expect(typeof ServerCacheInstance.keys).toBe('function');
    expect(typeof ServerCacheInstance.clear).toBe('function');
    expect(typeof ServerCacheInstance.getStats).toBe('function');

    // Test basic logo methods
    expect(typeof ServerCacheInstance.getLogoValidation).toBe('function');
    expect(typeof ServerCacheInstance.setLogoValidation).toBe('function');
    expect(typeof ServerCacheInstance.getLogoFetch).toBe('function');
    expect(typeof ServerCacheInstance.setLogoFetch).toBe('function');
    expect(typeof ServerCacheInstance.clearLogoFetch).toBe('function');
    expect(typeof ServerCacheInstance.clearAllLogoFetches).toBe('function');

    // Test basic bookmarks methods
    expect(typeof ServerCacheInstance.getBookmarks).toBe('function');
    expect(typeof ServerCacheInstance.setBookmarks).toBe('function');
    expect(typeof ServerCacheInstance.clearBookmarks).toBe('function');
    expect(typeof ServerCacheInstance.shouldRefreshBookmarks).toBe('function');
  });

  test('should store and retrieve a simple value', () => {
    const key = 'test-key';
    const value = { data: 'test-value' };

    // Set value
    ServerCacheInstance.set(key, value);

    // Get value
    const retrieved = ServerCacheInstance.get(key);

    expect(retrieved).toEqual(value);
  });
});
