/**
 * @file Modern Jest setup for Node 22 LTS native APIs
 * @description Minimal mocks for browser APIs, leveraging Node 22's native implementations
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
 * ✅ Node 22 LTS provides natively:
 * - fetch, Request, Response, Headers
 * - URL, URLSearchParams
 * - TextEncoder, TextDecoder
 * - ReadableStream, WritableStream, TransformStream
 * - AbortController, AbortSignal
 */

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

// Ensure Response.json helper exists (used by Next.js internals)
// Node 22 has Response.json, but ensure it's available in test environment
if (typeof globalThis.Response === "function" && typeof globalThis.Response.json !== "function") {
  globalThis.Response.json = (data, init = {}) => {
    const headers = new globalThis.Headers(init.headers || {});
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    return new globalThis.Response(JSON.stringify(data), {
      ...init,
      headers,
    });
  };
}

// Basic FormData mock if needed (Node 22 should have this)
if (!globalThis.FormData) {
  globalThis.FormData = class FormData {
    constructor() {
      this._data = new Map();
    }
    append(name, value) {
      this._data.set(name, value);
    }
    get(name) {
      return this._data.get(name);
    }
    has(name) {
      return this._data.has(name);
    }
    delete(name) {
      this._data.delete(name);
    }
  };
}
