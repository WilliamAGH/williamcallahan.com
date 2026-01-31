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

import { TextDecoder as UtilTextDecoder, TextEncoder as UtilTextEncoder } from "node:util";
import { ReadableStream, WritableStream, TransformStream } from "node:stream/web";
import { MessageChannel, MessagePort } from "node:worker_threads";
import { createRequire } from "node:module";

// Ensure NODE_ENV is set to "test" for server-only module checks
process.env.NODE_ENV = "test";

// Storage API mock (not available in Node.js)
// Use jest.fn() to maintain Jest API compliance for potential introspection
const createMockFn = () => jest.fn(() => undefined);
const mockStorage = {
  getItem: createMockFn(),
  setItem: createMockFn(),
  removeItem: createMockFn(),
  clear: createMockFn(),
  key: createMockFn(),
  length: 0,
};

if (!globalThis.localStorage) {
  globalThis.localStorage = mockStorage;
}

if (!globalThis.sessionStorage) {
  globalThis.sessionStorage = mockStorage;
}

if (!globalThis.TextEncoder) {
  globalThis.TextEncoder = UtilTextEncoder;
}

if (!globalThis.TextDecoder) {
  globalThis.TextDecoder = UtilTextDecoder;
}

if (!globalThis.ReadableStream) {
  globalThis.ReadableStream = ReadableStream;
}
if (!globalThis.WritableStream) {
  globalThis.WritableStream = WritableStream;
}
if (!globalThis.TransformStream) {
  globalThis.TransformStream = TransformStream;
}

if (!globalThis.MessageChannel) {
  globalThis.MessageChannel = MessageChannel;
}
if (!globalThis.MessagePort) {
  globalThis.MessagePort = MessagePort;
}

// Polyfill setImmediate/clearImmediate (Node.js globals used by Undici, missing in JSDOM)
if (typeof globalThis.setImmediate === "undefined") {
  const timers = require("node:timers");
  globalThis.setImmediate = timers.setImmediate;
  globalThis.clearImmediate = timers.clearImmediate;
}

// Polyfill performance.markResourceTiming (missing in JSDOM, required by Undici)
if (typeof globalThis.performance === "undefined") {
  globalThis.performance = {};
}
if (typeof globalThis.performance.markResourceTiming !== "function") {
  globalThis.performance.markResourceTiming = () => {};
}

// Hack: Patch Number.prototype to support .unref()/.ref() for Undici in JSDOM
// Undici expects setTimeout to return an object with .unref(), but JSDOM/Jest returns a number.
// This allows both native JSDOM timers and Jest fake timers to work with Undici.
// Note: This file is excluded from ESLint/Oxlint in eslint.config.ts and .oxlintrc.json
if (typeof Number.prototype.unref === "undefined") {
  Object.defineProperty(Number.prototype, "unref", {
    value: function () {
      /* no-op */
    },
  });
}
if (typeof Number.prototype.ref === "undefined") {
  Object.defineProperty(Number.prototype, "ref", {
    value: function () {
      /* no-op */
    },
  });
}

// Ensure fetch primitives exist in Jest jsdom (Node 22 provides them via undici)
const needsUndici =
  !globalThis.fetch || !globalThis.Headers || !globalThis.Request || !globalThis.Response;

if (needsUndici) {
  const require = createRequire(import.meta.url);
  const {
    fetch: undiciFetch,
    Headers: UndiciHeaders,
    Request: UndiciRequest,
    Response: UndiciResponse,
    FormData: UndiciFormData,
  } = require("undici");
  globalThis.fetch = undiciFetch;
  globalThis.Headers = UndiciHeaders;
  globalThis.Request = UndiciRequest;
  globalThis.Response = UndiciResponse;
  globalThis.FormData = UndiciFormData;
}

if (!globalThis.Blob) {
  try {
    const { Blob } = require("node:buffer");
    globalThis.Blob = Blob;
  } catch (_e) {
    // ignore
  }
}

if (!globalThis.File) {
  try {
    const { File } = require("node:buffer");
    globalThis.File = File;
  } catch (_e) {
    // ignore
  }
}

// Note: Bun 1.2.22 provides Response.json natively, no polyfill needed

// Note: Bun 1.2.22 provides FormData natively, no polyfill needed
