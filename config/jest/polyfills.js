/**
 * @file Browser-only API mocks for Jest with Bun runtime
 * @description Provides mocks for browser APIs not available in Bun/Node environments
 *
 * 🚨 CRITICAL: Only loaded when using npm/bun run scripts!
 *
 * Direct `bun test` bypasses this file entirely, causing:
 * - Missing DOM mocks
 * - Storage APIs missing
 *
 * ALWAYS use: bun run test (includes these mocks)
 * NEVER use: bun test (missing these mocks)
 *
 * ✅ Bun 1.2.22 provides natively (no polyfills needed):
 * - fetch, Request, Response, Headers, Response.json
 * - URL, URLSearchParams
 * - TextEncoder, TextDecoder
 * - ReadableStream, WritableStream, TransformStream
 * - AbortController, AbortSignal
 * - FormData
 * - MessageChannel, MessagePort
 */

// Ensure NODE_ENV is set to "test" for server-only module checks
process.env.NODE_ENV = "test";

// Storage API mock (not available in Node.js)
const mockStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  key: jest.fn(),
  length: 0,
};

if (!globalThis.localStorage) {
  globalThis.localStorage = mockStorage;
}

if (!globalThis.sessionStorage) {
  globalThis.sessionStorage = mockStorage;
}

// Note: Bun 1.2.22 provides Response.json natively, no polyfill needed

// Note: Bun 1.2.22 provides FormData natively, no polyfill needed
