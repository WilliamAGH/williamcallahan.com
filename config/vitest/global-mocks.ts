import { vi } from "vitest";

// Mock caches API (Edge Runtime/Cloudflare Workers API)
const mockCache = {
  match: vi.fn<(request: RequestInfo | URL) => Promise<Response | undefined>>(),
  put: vi.fn<(request: RequestInfo | URL, response: Response) => Promise<void>>(),
  delete: vi.fn<(request: RequestInfo | URL) => Promise<boolean>>(),
};

const openCache = vi
  .fn<(cacheName: string) => Promise<typeof mockCache>>()
  .mockResolvedValue(mockCache);

const cachesMock = {
  default: mockCache,
  open: openCache,
};

Object.defineProperty(globalThis, "caches", {
  value: cachesMock,
  writable: true,
  configurable: true,
});
