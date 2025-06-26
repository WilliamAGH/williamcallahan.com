/**
 * @file config/jest/global-mocks.ts
 * @description This file is for setting up global mocks that must exist
 * before any other test code is executed. It's loaded via `setupFiles` in Jest config.
 * Note: Fetch polyfills are handled by polyfills.js which loads before this file.
 */

// Mock caches API (Edge Runtime/Cloudflare Workers API)
const mockCache = {
  match: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
};

const cachesMock = {
  default: mockCache,
  open: jest.fn().mockResolvedValue(mockCache),
};

// @ts-ignore - Mock Edge Runtime caches API
global.caches = cachesMock;
Object.defineProperty(globalThis, "caches", {
  value: cachesMock,
  writable: true,
  configurable: true,
});

