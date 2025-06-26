/**
 * @file Jest core setup - Essential polyfills and environment setup
 * @description Provides critical polyfills for Node.js environment in Jest tests
 *
 * 🚨 WARNING: Only loaded via npm/bun run scripts!
 * Direct `bun test` usage bypasses this file and causes environment failures.
 *
 * Use: bun run test (loads this setup)
 * NOT: bun test (skips this setup)
 */
import { TextDecoder, TextEncoder } from "node:util";
import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";

// Polyfill for TextEncoder and TextDecoder
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as typeof global.TextDecoder;

// Polyfill Web APIs for JSDOM
if (typeof globalThis.ReadableStream === "undefined") {
  Object.defineProperty(globalThis, "ReadableStream", {
    value: class ReadableStream {
      // Basic mock implementation - no constructor needed
    },
    writable: true,
    configurable: true,
  });
}

if (typeof globalThis.MessagePort === "undefined") {
  Object.defineProperty(globalThis, "MessagePort", {
    value: class MessagePort {
      postMessage = jest.fn();
      close = jest.fn();
      start = jest.fn();
      addEventListener = jest.fn();
      removeEventListener = jest.fn();
      dispatchEvent = jest.fn();
    },
    writable: true,
    configurable: true,
  });
}

if (typeof globalThis.MessageChannel === "undefined") {
  Object.defineProperty(globalThis, "MessageChannel", {
    value: class MessageChannel {
      port1 = new (globalThis as { MessagePort: typeof MessagePort }).MessagePort();
      port2 = new (globalThis as { MessagePort: typeof MessagePort }).MessagePort();
    },
    writable: true,
    configurable: true,
  });
}

import React from "react";

// Ensure React.act is available
if (typeof React.act === "undefined") {
  // For React 18+, act is available on React itself
  const { act } = require("react");
  React.act = act;
}

// Setup clipboard API mock
Object.defineProperty(navigator, "clipboard", {
  value: {
    writeText: jest.fn(() => Promise.resolve()),
    readText: jest.fn(() => Promise.resolve("")),
  },
  writable: true,
});

// Suppress unnecessary console output in tests
beforeAll(() => {
  jest.spyOn(global.console, "log").mockImplementation(() => {});
  jest.spyOn(global.console, "debug").mockImplementation(() => {});
  jest.spyOn(global.console, "warn").mockImplementation(() => {});
  jest.spyOn(global.console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
  // Remove any remaining timers (setTimeout/Interval) created during a test so Jest can exit cleanly.
  jest.clearAllTimers();
});
