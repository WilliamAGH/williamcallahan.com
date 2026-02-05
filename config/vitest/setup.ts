/**
 * Vitest Global Setup
 *
 * Configures the test environment for all Vitest tests:
 * - Imports jest-dom matchers for Vitest
 * - Mocks React.cache for React 19 compatibility
 * - Provides DOM API mocks (matchMedia, IntersectionObserver, etc.) when running in jsdom
 * - Suppresses noisy console output during tests
 * - Cleans up after each test
 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { vi, afterEach, beforeAll, afterAll } from "vitest";
import React from "react";
import { ServerCacheInstance } from "@/lib/server-cache";

// Mock next/link to avoid DOM navigation and strip non-DOM props
type MockNextLinkProps = React.PropsWithChildren<{
  href: string;
  onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  prefetch?: boolean | null | "auto";
  scroll?: boolean;
}> &
  Record<string, unknown>;

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, onClick, prefetch, scroll, ...props }: MockNextLinkProps) => {
    void prefetch;
    void scroll;
    return React.createElement(
      "a",
      {
        href,
        onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
          event.preventDefault();
          onClick?.(event);
        },
        ...props,
      },
      children,
    );
  },
}));

// Mock React.cache for React 19 in test environment
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache: vi.fn((fn) => fn),
  };
});

// Ensure React.act is available (React 18+)
if (typeof React.act === "undefined") {
  const { act } = require("react");
  React.act = act;
}

// ------------------------------------------------------------------
// DOM Mocks (only apply when window is available - jsdom environment)
// ------------------------------------------------------------------

if (typeof window !== "undefined") {
  // Mock window.matchMedia
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated
      removeListener: vi.fn(), // deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // Mock window.scrollTo
  window.scrollTo = vi.fn();

  // Mock IntersectionObserver
  class MockIntersectionObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  window.IntersectionObserver = MockIntersectionObserver as any;

  // Mock ResizeObserver
  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  window.ResizeObserver = MockResizeObserver as any;

  // Mock MessageChannel
  const createMockMessagePort = () => ({
    postMessage: vi.fn(),
    onmessage: null,
    close: vi.fn(),
    start: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
  class MockMessageChannel {
    port1 = createMockMessagePort();
    port2 = createMockMessagePort();
  }
  window.MessageChannel = MockMessageChannel as any;

  // Setup clipboard API mock
  if (typeof navigator !== "undefined") {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: vi.fn(() => Promise.resolve()),
        readText: vi.fn(() => Promise.resolve("")),
      },
      writable: true,
    });
  }
}

// ------------------------------------------------------------------
// Console Suppression
// ------------------------------------------------------------------

const pristineConsoleError = console.error.bind(console);
const originalError = (...data: any[]) => {
  pristineConsoleError(...data);
};

const SUPPRESSED_PATTERNS = [
  "Warning: ReactDOM.render",
  "inside a test was not wrapped in act",
  "A suspended resource finished loading inside a test",
  "Consider adding an error boundary",
  "ReactDOMTestUtils.act",
  "[validateBookmarksDataset][SAFEGUARD]",
  "[BookmarksDataAccess]",
  "[API Bookmarks]",
  "[UnitTest]",
  "Sitemap: Failed to get mtime",
  "[OG-Image]",
  "Search API",
  "[DataFetchManager]",
  "[MemoryHealthMonitor]",
];

const suppressedConsoleError = (...data: any[]) => {
  const message = data
    .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
    .join(" ");

  const shouldSuppress = SUPPRESSED_PATTERNS.some((pattern) => message.includes(pattern));

  if (!shouldSuppress) {
    originalError(...data);
  }
};

console.error = suppressedConsoleError;

// Suppress unnecessary console output in tests
beforeAll(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "debug").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  // error is handled by suppressedConsoleError
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.clearAllTimers();
  // Re-apply suppression in case it was overridden by a test
  console.error = suppressedConsoleError;
});

afterAll(() => {
  ServerCacheInstance.destroy();
  console.error = originalError;
});
