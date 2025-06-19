/* eslint-disable */
/// <reference types="jest" />
import "jest-extended";
// Mock react-dom/test-utils to provide a simple act implementation before importing modules
jest.mock("react-dom/test-utils", () => ({
  act(callback: () => void) {
    // Directly invoke the callback for synchronous updates
    return callback();
  },
}));
// Learn more: https://github.com/testing-library/jest-dom
import "@testing-library/jest-dom";
// Ensure React.act is defined for React Testing Library's act compatibility
import React from "react";
import * as ReactTestUtils from "react-dom/test-utils";
import "./core-setup.ts";
import "./dom-setup.ts";

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
}

// Mock Next.js router
jest.mock("next/navigation", () => ({
  useRouter() {
    return {
      prefetch: () => null,
      push: jest.fn(),
      replace: jest.fn(),
      refresh: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
    };
  },
  useSearchParams() {
    return {
      get: jest.fn(),
    };
  },
  usePathname() {
    return "";
  },
  useParams() {
    return {};
  },
}));

// Mock Next.js image component
jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: React.ComponentProps<"img"> & { priority?: boolean; fill?: boolean }) => {
    return React.createElement("img", {
      ...props,
      "data-testid": "next-image-mock",
      // Convert boolean props to strings to avoid React warnings
      "data-priority": props.priority ? "true" : "false",
      "data-fill": props.fill ? "true" : "false",
      priority: undefined, // Remove the boolean prop to avoid React warning
      fill: undefined, // Remove the boolean prop to avoid React warning
    });
  },
}));

// Mock window.scrollTo (only in jsdom environment)
if (typeof window !== "undefined") {
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
}

// Mock NextResponse.json helper used in API routes
jest.mock("next/server", () => {
  const original = jest.requireActual("next/server");
  return {
    ...original,
    NextResponse: {
      json: (data: unknown, init: { status?: number; headers?: Record<string, string> } = {}) => {
        return {
          status: init.status ?? 200,
          headers: {
            get: (key: string) => {
              if (key.toLowerCase() === "content-type") return "application/json";
              return init.headers?.[key] ?? null;
            },
          },
          json: async () => data,
        } as unknown as Response;
      },
    },
  };
});

// Provide a default mock for the server-side bookmarks data access module so that
// tests can override it with their own implementations (e.g., mockResolvedValue).
// This ensures that importing `getBookmarks` from either
// `@/lib/bookmarks` *or* `@/lib/bookmarks/bookmarks-data-access.server` always
// yields a `jest.fn()` that supports mock helpers like `mockResolvedValue`.
jest.mock("@/lib/bookmarks/bookmarks-data-access.server", () => {
  // Preserve all the actual exports to avoid breaking tests that rely on
  // helpers like `setRefreshBookmarksCallback`, while overriding
  // `getBookmarks` with a jest mock function that individual tests can
  // customise via `mockResolvedValue`/`mockImplementation`.
  const actual = jest.requireActual("@/lib/bookmarks/bookmarks-data-access.server");
  const wrappedGetBookmarks = jest.fn(actual.getBookmarks);
  return {
    __esModule: true,
    ...actual,
    getBookmarks: wrappedGetBookmarks,
  };
});

// ---------------------------------------------------------------------------
// Suppress noisy console.error logs during test runs
// ---------------------------------------------------------------------------

// Capture a reference to the *actual* console.error implementation before any
// test files or mocks have a chance to modify it.
// Explicitly type the function to avoid implicit `any` usage downstream.
const pristineConsoleError = console.error.bind(console);
const originalError: (...data: unknown[]) => void = (...data) => {
  // Forward everything straight to the untouched implementation.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  pristineConsoleError(...(data as unknown[]));
};

// Patterns we always want to silence. Extend this list as the codebase grows.
const SUPPRESSED_PATTERNS = [
  "Warning: ReactDOM.render",
  "inside a test was not wrapped in act",
  "Consider adding an error boundary",
  "ReactDOMTestUtils.act",
  // Validator-level safeguards (these are expected failures we assert on)
  "[validateBookmarksDataset]",
];

console.error = (...args: unknown[]) => {
  const firstArg = args[0];
  if (typeof firstArg === "string" && SUPPRESSED_PATTERNS.some((p) => (firstArg as string).includes(p))) {
    return;
  }
  originalError(...args);
};
