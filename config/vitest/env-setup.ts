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

// Polyfill performance.markResourceTiming (missing in JSDOM)
if (typeof globalThis.performance === "undefined") {
  // @ts-expect-error - performance is readonly in some envs but we need to mock it if missing
  globalThis.performance = {};
}

// @ts-expect-error - extending performance with non-standard API required by Next.js/Undici
if (typeof globalThis.performance.markResourceTiming !== "function") {
  // @ts-expect-error - extending performance
  globalThis.performance.markResourceTiming = () => {};
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
process.env.NEXT_PUBLIC_BASE_URL = "http://localhost:3000";
