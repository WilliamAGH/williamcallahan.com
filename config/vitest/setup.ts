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
  class MockIntersectionObserver implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds = [];

    disconnect(): void {
      return undefined;
    }

    observe(_target: Element): void {
      void _target;
    }

    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }

    unobserve(_target: Element): void {
      void _target;
    }
  }
  Object.defineProperty(window, "IntersectionObserver", {
    writable: true,
    value: MockIntersectionObserver,
  });

  // Mock ResizeObserver
  class MockResizeObserver implements ResizeObserver {
    disconnect(): void {
      return undefined;
    }

    observe(_target: Element): void {
      void _target;
    }

    unobserve(_target: Element): void {
      void _target;
    }
  }
  Object.defineProperty(window, "ResizeObserver", {
    writable: true,
    value: MockResizeObserver,
  });

  // Mock MessageChannel
  class MockMessagePort extends EventTarget implements MessagePort {
    onmessage: ((this: MessagePort, ev: MessageEvent<unknown>) => void) | null = null;
    onmessageerror: ((this: MessagePort, ev: MessageEvent<unknown>) => void) | null = null;

    close(): void {
      return undefined;
    }

    postMessage(
      _message: unknown,
      _transferOrOptions?: StructuredSerializeOptions | Transferable[],
    ): void {
      void _message;
      void _transferOrOptions;
    }

    start(): void {
      return undefined;
    }
  }
  class MockMessageChannel implements MessageChannel {
    readonly port1 = new MockMessagePort();
    readonly port2 = new MockMessagePort();
  }
  Object.defineProperty(window, "MessageChannel", {
    writable: true,
    value: MockMessageChannel,
  });

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
const originalError = (...data: unknown[]) => {
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
];

const suppressedConsoleError = (...data: unknown[]) => {
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
  console.error = originalError;
});
