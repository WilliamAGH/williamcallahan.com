/**
 * Mock for @sentry/nextjs in Vitest tests
 */
import { vi, type Mock } from "vitest";
import type * as Sentry from "@sentry/nextjs";

interface ScopeContext {
  setTag: Mock<Sentry.Scope["setTag"]>;
  setLevel: Mock<Sentry.Scope["setLevel"]>;
  setContext: Mock<Sentry.Scope["setContext"]>;
}

interface MockSentryClient {
  captureException: Mock<typeof Sentry.captureException>;
  captureMessage: Mock<typeof Sentry.captureMessage>;
}

interface MockSentryHub {
  getClient: Mock<() => MockSentryClient>;
}

export const captureException = vi.fn<typeof Sentry.captureException>();
export const captureMessage = vi.fn<typeof Sentry.captureMessage>();
// `configureScope` and `getCurrentHub` were removed from the Sentry v8+ API; these stubs keep their legacy shapes.
export const configureScope = vi.fn<(callback: (scope: ScopeContext) => void) => void>();
export const init = vi.fn<typeof Sentry.init>();

export const getCurrentHub = vi.fn<() => MockSentryHub>(() => ({
  getClient: vi.fn<() => MockSentryClient>(() => ({
    captureException: vi.fn<typeof Sentry.captureException>(),
    captureMessage: vi.fn<typeof Sentry.captureMessage>(),
  })),
}));

export const withScope = vi.fn<(callback: (scope: ScopeContext) => void) => void>((callback) =>
  callback({
    setTag: vi.fn<Sentry.Scope["setTag"]>(),
    setLevel: vi.fn<Sentry.Scope["setLevel"]>(),
    setContext: vi.fn<Sentry.Scope["setContext"]>(),
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
