import { vi } from "vitest";

// Mock caches API (Edge Runtime/Cloudflare Workers API)
const mockCache = {
  match: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

const openCache = vi.fn().mockResolvedValue(mockCache);

const cachesMock = {
  default: mockCache,
  open: openCache,
};

Object.defineProperty(globalThis, "caches", {
  value: cachesMock,
  writable: true,
  configurable: true,
});
