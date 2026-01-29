/**
 * @file Jest setup configuration
 * @description Sets up Jest environment with polyfills, mocks, and testing utilities
 *
 * 🚨 CRITICAL: This file is ONLY loaded when using npm/bun run scripts!
 *
 * ❌ NEVER use: bun test (bypasses this setup entirely)
 * ✅ ALWAYS use: bun run test (loads this setup correctly)
 *
 * Without this setup file, you will get:
 * - jest.mock is not defined
 * - Missing DOM APIs and polyfills
 * - React Testing Library failures
 * - Mock configuration missing
 */
/// <reference types="jest" />
import "jest-extended";
import "@testing-library/jest-dom";
import "./core-setup.ts";
import "./dom-setup.ts";
import { ServerCacheInstance } from "@/lib/server-cache";

// Mock React.cache for React 19 in test environment
// This fixes "cache is not a function" errors in tests
jest.mock("react", () => {
  const actual = jest.requireActual("react");
  return {
    ...actual,
    cache: jest.fn((fn) => fn), // Pass through function
  };
});

// Ensure React.act is available
import React from "react";
import * as ReactTestUtils from "react-dom/test-utils";

type ActFn = (callback: () => void) => void;
const ReactModule = React as unknown as { act?: ActFn };

if (typeof ReactModule.act !== "function") {
  ReactModule.act = ReactTestUtils.act;
}

// Mock window.matchMedia (only in jsdom environment)
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: jest.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(), // Deprecated
      removeListener: jest.fn(), // Deprecated
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });

  // Mock window.scrollTo
  global.scrollTo = jest.fn() as typeof window.scrollTo;

  // Mock global analytics objects
  global.umami = {
    track: jest.fn(),
    identify: jest.fn(),
  };

  global.plausible = jest.fn();

  // Mock IntersectionObserver
  class MockIntersectionObserver {
    observe = jest.fn();
    unobserve = jest.fn();
    disconnect = jest.fn();
  }
  global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

  // Mock ResizeObserver
  class MockResizeObserver {
    observe = jest.fn();
    unobserve = jest.fn();
    disconnect = jest.fn();
  }
  global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

  // Mock MessageChannel for React SSR tests
  class MockMessageChannel {
    port1 = {
      postMessage: jest.fn(),
      onmessage: null,
      close: jest.fn(),
      start: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    };
    port2 = {
      postMessage: jest.fn(),
      onmessage: null,
      close: jest.fn(),
      start: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    };
  }
  global.MessageChannel = MockMessageChannel as unknown as typeof MessageChannel;

  // Mock global fetch for tests that need it (Node 22 native)
  if (!global.fetch) {
    const fetchMock = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(""),
        headers: new Headers(),
        statusText: "OK",
      }),
    );

    // Add preconnect method to match Node 22's fetch API using Jest v30 pattern
    const typedFetchMock = jest.mocked(fetchMock);
    Object.assign(typedFetchMock, { preconnect: jest.fn() });

    global.fetch = typedFetchMock as unknown as typeof fetch;
  }
}

// Capture console.error for suppression
const pristineConsoleError = console.error.bind(console);
const originalError: (...data: unknown[]) => void = (...data) => {
  pristineConsoleError(...(data as unknown[]));
};

// Patterns we always want to silence (used for both console.error and console.warn)
const SUPPRESSED_PATTERNS = [
  "Warning: ReactDOM.render",
  "inside a test was not wrapped in act",
  "A suspended resource finished loading inside a test, but the event was not wrapped in act",
  "Consider adding an error boundary",
  "ReactDOMTestUtils.act",
  "[validateBookmarksDataset][SAFEGUARD]",
  "[BookmarksDataAccess] Failed to refresh bookmarks",
  "[refreshBookmarksData] PRIMARY_FETCH_FAILURE",
  "[refreshBookmarksData] S3_FALLBACK_FAILURE",
  "[BookmarksDataAccess] Error reading bookmarks file",
  "[BookmarksDataAccess] Error during distributed lock release",
  "[API Bookmarks] Failed to fetch bookmarks",
  "[UnitTest] QUANTITY MISMATCH!",
  "[UnitTest] IDs in External API only:",
  "Sitemap: Failed to get mtime",
  "[OG-Image] Unexpected error:",
  "Search API call failed for site-wide search:",
  "Site-wide search API call failed:",
  "Search API call failed for scope",
  "Error searching in section",
  "Search API returned 500",
  "[DataFetchManager] Error collecting domains:",
  "[MemoryHealthMonitor] ServerCacheInstance.getStats is unavailable",
];

// Suppress noisy console.error logs during test runs
const suppressedConsoleError = (...data: unknown[]) => {
  const message = data
    .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
    .join(" ");

  const shouldSuppress = SUPPRESSED_PATTERNS.some((pattern) => message.includes(pattern));

  if (!shouldSuppress) {
    originalError(...data);
  }
};

// Replace console.error with our suppressed version
console.error = suppressedConsoleError;

// Clean up test state but maintain console suppression
afterEach(() => {
  // Clean up any test-specific state but keep console.error suppressed
  jest.clearAllMocks();
  jest.clearAllTimers();
  // Re-apply suppression in case it was overridden by a test
  console.error = suppressedConsoleError;
});

// Restore original console.error after all tests
afterAll(() => {
  ServerCacheInstance.destroy();
  console.error = originalError;
});
