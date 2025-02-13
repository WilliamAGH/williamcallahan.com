/**
 * Test Mocks
 * REMEMBER: WE ALWAYS PREFER REAL TEST DATA WHERE POSSIBLE, NOT MOCK DATA
 *
 * @packageDocumentation
 * @module Tests/Setup
 * @description Provides mock implementations for external dependencies.
 * Centralizes all mock definitions for consistent test behavior.
 */

import type { ReactNode } from "react";
import type { CommandResult } from "@/types/terminal";

/**
 * Mock router implementation
 */
export const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  forward: jest.fn(),
  refresh: jest.fn(),
  prefetch: jest.fn()
};

/**
 * Mock terminal context implementation
 */
export const mockTerminalContext = {
  clearHistory: jest.fn(),
  isReady: true
};

/**
 * Mock command result implementation
 */
export const mockCommandResult: CommandResult = {
  results: [{ output: "Mock command output" }]
};

/**
 * Mock module implementations
 *
 * IMPORTANT: These mocks must be imported before any tests that use them.
 * They are automatically imported by jest.setup.js.
 */

// Mock next/navigation
jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter
}), { virtual: true });

// Mock terminal context
jest.mock("@/components/ui/terminalContext", () => {
  const context = {
    clearHistory: jest.fn(),
    isReady: true
  };

  return {
    useTerminalContext: jest.fn(() => {
      if (!context) {
        throw new Error("useTerminalContext must be used within TerminalProvider");
      }
      return context;
    }),
    TerminalProvider: ({ children }: { children: ReactNode }) => children
  };
}, { virtual: true });

// Mock terminal commands
jest.mock("@/components/ui/terminal/commands", () => ({
  handleCommand: jest.fn(() => Promise.resolve(mockCommandResult))
}), { virtual: true });

/**
 * Mock window implementations
 */
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: jest.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }))
  });
}

/**
 * Mock browser APIs
 */
class MockResizeObserver {
  constructor() {
    this.observe = jest.fn();
    this.unobserve = jest.fn();
    this.disconnect = jest.fn();
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

class MockIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    this.observe = jest.fn();
    this.unobserve = jest.fn();
    this.disconnect = jest.fn();
    this.takeRecords = jest.fn(() => []);
    this.callback = callback;
    this.root = null;
    this.rootMargin = "0px";
    this.thresholds = [0];
  }
  readonly root: Element | null;
  readonly rootMargin: string;
  readonly thresholds: ReadonlyArray<number>;
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] { return []; }
  private callback: IntersectionObserverCallback;
}

global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

/**
 * Mock file for handling asset imports in tests
 */

// Mock for static assets
export const assetMock = 'test-file-stub';
export default assetMock;

// Mock for CSS modules
export const cssModuleMock = new Proxy(
  {},
  {
    get: function getter(target: any, key: string) {
      // Return the key as the value for all style imports
      return key;
    }
  }
);

/**
 * Mock form event creator
 */
export function createMockFormEvent(): React.FormEvent {
  return {
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
    target: document.createElement("form")
  } as unknown as React.FormEvent;
}

/**
 * Mock selection items creator
 */
export function createMockSelectionItems() {
  return [
    {
      label: "Test Item 1",
      value: "test1",
      action: "navigate" as const,
      path: "/test1"
    },
    {
      label: "Test Item 2",
      value: "test2",
      action: "execute" as const,
      command: "test2"
    }
  ];
}
