/**
 * Mock for @sentry/nextjs in Vitest tests
 */
import { vi } from "vitest";

export const captureException = vi.fn();
export const captureMessage = vi.fn();
export const configureScope = vi.fn();
export const init = vi.fn();

export const getCurrentHub = vi.fn(() => ({
  getClient: vi.fn(() => ({
    captureException: vi.fn(),
    captureMessage: vi.fn(),
  })),
}));

interface ScopeContext {
  setTag: ReturnType<typeof vi.fn>;
  setLevel: ReturnType<typeof vi.fn>;
  setContext: ReturnType<typeof vi.fn>;
}

export const withScope = vi.fn((callback: (scope: ScopeContext) => void) =>
  callback({
    setTag: vi.fn(),
    setLevel: vi.fn(),
    setContext: vi.fn(),
  }),
);

// Default export for CommonJS compatibility
export default {
  captureException,
  captureMessage,
  configureScope,
  init,
  getCurrentHub,
  withScope,
};
