import { describe, it, expect } from 'bun:test';
import { ServerCacheInstance } from '../../lib/server-cache';

describe('ServerCacheInstance Initialization', () => {
  it('should be properly initialized with correct methods', () => {
    // Verify cache instance has been created
    expect(ServerCacheInstance).toBeDefined();

    // Verify key cache methods exist
    expect(typeof ServerCacheInstance.get).toBe('function');
    expect(typeof ServerCacheInstance.set).toBe('function');
    expect(typeof ServerCacheInstance.del).toBe('function');
    expect(typeof ServerCacheInstance.keys).toBe('function');
    expect(typeof ServerCacheInstance.getStats).toBe('function');

    // Verify logo-specific methods
    expect(typeof ServerCacheInstance.getLogoFetch).toBe('function');
    expect(typeof ServerCacheInstance.setLogoFetch).toBe('function');
    expect(typeof ServerCacheInstance.clearLogoFetch).toBe('function');
    expect(typeof ServerCacheInstance.clearAllLogoFetches).toBe('function');

    // Verify bookmarks-specific methods
    expect(typeof ServerCacheInstance.getBookmarks).toBe('function');
    expect(typeof ServerCacheInstance.setBookmarks).toBe('function');
    expect(typeof ServerCacheInstance.clearBookmarks).toBe('function');

    // Verify GitHub activity-specific methods
    expect(typeof ServerCacheInstance.getGithubActivity).toBe('function');
    expect(typeof ServerCacheInstance.setGithubActivity).toBe('function');
    expect(typeof ServerCacheInstance.clearGithubActivity).toBe('function');
  });
});