# Testing Configuration & Modernization Guide

**Functionality:** `testing-config`

This document defines the Vitest-based testing architecture for this project. It replaces legacy Jest guidance and aligns with Next.js 16 + React 19 + Bun runtime constraints.

## Anti-Polyfill Mandate

This codebase forbids polyfills. Use native runtime APIs, ponyfills, or targeted mocks only. Do not patch `globalThis`, `window`, or `global` to emulate legacy browser environments.

## Core Principle: Vitest Only

All tests run through Vitest via `bun run` scripts so the correct configuration is loaded. Do not use `bun test` directly.

Required scripts:

```bash
bun run test
bun run test:watch
bun run test:coverage
bun run test:ci
bun run test:smoke
```

## Next.js 16 + Vitest Constraints

Vitest does not support rendering async Server Components. Unit tests may cover synchronous Server and Client Components. Use E2E coverage for async pages/layouts and Server Actions.

## Configuration Files (Source of Truth)

- `vitest.config.ts` defines plugins, jsdom environment, and aliasing for Next.js internals.
- `config/vitest/setup.ts` registers `@testing-library/jest-dom/vitest`, core DOM mocks, and console suppression.
- `config/vitest/env-setup.ts` provides targeted environment mocks only when required by tests.
- `config/vitest/global-mocks.ts` provides global cache API stubs.

## Live Integration Tests (Opt-In)

Some tests exercise real external services and are gated by environment variables with
`describe.runIf(...)`. Example: `__tests__/lib/chroma/chroma-actual.test.ts` only runs
when `CHROMA_API_KEY`, `CHROMA_TENANT`, and `CHROMA_DATABASE` are configured. These tests
must remain opt-in and should be run explicitly in controlled environments.

## Mocking Patterns (Vitest)

Use Vitest primitives:

```typescript
import { vi } from "vitest";

vi.mock("@/lib/data", () => ({
  fetchData: vi.fn(),
}));

const spy = vi.spyOn(console, "error").mockImplementation(() => {});
```

Prefer `vi.importActual` and `vi.importMock` for module factories that need real exports. Avoid CommonJS-specific Jest patterns.

### Mock Placement (Enforced)

Dedicated mock modules must live under `__tests__/__mocks__/`. Do not place mock files directly under `__tests__/` (for example, `**/*mock*.ts` outside `__tests__/__mocks__`). This is enforced by the ast-grep rule `[TST2]`.

## React 19 Testing Notes

Use `act` or `waitFor` when state updates are async. If `React.act` is missing in tests, it is registered in `config/vitest/setup.ts`.

## Troubleshooting

`ReferenceError: vi is not defined` means you ran `bun test` directly. Use `bun run test` so Vitest config loads.

`document is not defined` means the jsdom environment or setup files did not load. Confirm `vitest.config.ts` and `config/vitest/setup.ts` are referenced correctly.

## Official Docs

- Next.js Vitest setup: https://nextjs.org/docs/app/guides/testing/vitest
- Vitest config: https://vitest.dev/config/
- React Testing Library: https://testing-library.com/docs/react-testing-library/intro/
