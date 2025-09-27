/**
 * @file Jest core setup - Test environment configuration
 * @description Provides test environment setup and browser API mocks
 *
 * 🚨 WARNING: Only loaded via npm/bun run scripts!
 * Direct `bun test` usage bypasses this file and causes environment failures.
 *
 * Use: bun run test (loads this setup)
 * NOT: bun test (skips this setup)
 *
 * ✅ Bun 1.2.22 provides all Web APIs natively - no polyfills needed
 */
import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";

// Note: Bun 1.2.22 provides ReadableStream natively, no polyfill needed

// Note: Bun 1.2.22 provides MessagePort and MessageChannel natively, no polyfill needed

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

// ------------------------------------------------------------------
// Polyfill TextEncoder / TextDecoder for libraries like image-js that
// expect them to be available in the global scope under Jest's Node env.
// Node >=18 exposes them globally, but some Jest environments do not.
// ------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { TextEncoder: UtilTextEncoder, TextDecoder: UtilTextDecoder } = require("node:util");

if (typeof global.TextEncoder === "undefined" && UtilTextEncoder) {
  global.TextEncoder = UtilTextEncoder;
}

if (typeof global.TextDecoder === "undefined" && UtilTextDecoder) {
  global.TextDecoder = UtilTextDecoder as unknown as typeof global.TextDecoder;
}
