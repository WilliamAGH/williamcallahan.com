/**
 * @file config/jest/global-mocks.ts
 * @description This file is for setting up global mocks that must exist
 * before any other test code is executed. It's loaded via `setupFiles` in Jest config.
 * Note: Fetch polyfills are handled by polyfills.js which loads before this file.
 */

import { jest } from "@jest/globals";

type MockCache = {
  match: ReturnType<typeof jest.fn>;
  put: ReturnType<typeof jest.fn>;
  delete: ReturnType<typeof jest.fn>;
};

// Mock caches API (Edge Runtime/Cloudflare Workers API)
const mockCache: MockCache = {
  match: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
};

const openCache = jest.fn() as jest.MockedFunction<(cacheName: string) => Promise<MockCache>>;
openCache.mockResolvedValue(mockCache);

const cachesMock = {
  default: mockCache,
  open: openCache,
};

Object.defineProperty(globalThis, "caches", {
  value: cachesMock,
  writable: true,
  configurable: true,
});
