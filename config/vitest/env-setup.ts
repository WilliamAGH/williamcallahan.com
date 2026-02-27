import { vi } from "vitest";

// Storage API mock (not available in JSDOM/Node)
const createMockFn = () => vi.fn(() => undefined);

const mockStorage = {
  getItem: createMockFn(),
  setItem: createMockFn(),
  removeItem: createMockFn(),
  clear: createMockFn(),
  key: createMockFn(),
  length: 0,
};

if (!globalThis.localStorage) {
  Object.defineProperty(globalThis, "localStorage", {
    value: mockStorage,
  });
}

if (!globalThis.sessionStorage) {
  Object.defineProperty(globalThis, "sessionStorage", {
    value: mockStorage,
  });
}

// Polyfill performance.markResourceTiming (missing in JSDOM).
// Object.defineProperty bypasses TypeScript's readonly constraint without suppression.
if (typeof globalThis.performance === "undefined") {
  Object.defineProperty(globalThis, "performance", {
    value: {},
    writable: true,
    configurable: true,
  });
}

// Next.js/Undici calls markResourceTiming at runtime; JSDOM doesn't provide it.
if (!("markResourceTiming" in globalThis.performance)) {
  Object.defineProperty(globalThis.performance, "markResourceTiming", {
    value: () => {},
    writable: true,
    configurable: true,
  });
}

// Note: Bun 1.2+ provides TextEncoder, ReadableStream, fetch, etc. natively.
// We do not polyfill them here to strictly follow [PL1] Anti-Polyfill mandate.

// Add required environment variables for tests
process.env.NEXT_PUBLIC_S3_CDN_URL = "https://cdn.example.com";
process.env.S3_BUCKET = "test-bucket";
process.env.S3_REGION = "us-east-1";
process.env.S3_ACCESS_KEY_ID = "test-key";
process.env.S3_SECRET_ACCESS_KEY = "test-secret";
process.env.S3_ENDPOINT = "http://localhost:9000";
process.env.S3_SERVER_URL = "http://localhost:9000";
process.env.NEXT_PUBLIC_BASE_URL = "http://localhost:3000";
process.env.USE_S3_SEARCH_INDEXES = "false";

// Search source timeout: production uses 20s to handle cold-start S3 loads,
// but in tests all searchers are mocked (resolve in <1ms). A 5s ceiling
// prevents the source timeout from colliding with Vitest's testTimeout (20s),
// eliminating flaky failures when the event loop is under GC pressure.
process.env.SEARCH_SOURCE_TIMEOUT_MS = "5000";
