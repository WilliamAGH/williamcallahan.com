// __tests__/lib/setup/testing-library.ts
/**
 * Testing Library Setup for Bun:test
 *
 * This file configures @testing-library/react and @testing-library/jest-dom
 * for use with the Bun test runner (`bun:test`).
 *
 * Key points for the dual Bun/Jest testing strategy:
 * 1. Test Runner Priority: `bun test` is the primary runner for speed.
 *    Tests requiring specific Jest features (e.g., complex module mocks not yet
 *    in Bun) should be named `*.jest.test.ts` or `*.jest.spec.ts` and will
 *    be run by the `test:jest` script.
 * 2. Type Safety: `tsconfig.json` prioritizes `bun-types`. Jest types are
 *    available contextually for `*.jest.*` files via ESLint configuration.
 * 3. Linting: ESLint (`eslint.config.ts`) is configured to apply
 *    `eslint-plugin-jest` rules only to `*.jest.*` files.
 * 4. Shared Setup: General test setup that is compatible with both runners
 *    (like the one in `__tests__/setup.ts`) can be used by all tests.
 *    Bun's `jest.fn()` compatibility is generally good.
 *
 * The `bun run test` command executes both `bun test` (for standard tests)
 * and the Jest runner (for `*.jest.*` files) sequentially.
 *
 * This setup ensures that Testing Library matchers are available for tests
 * run with `bun:test`.
 */
import { afterEach, expect } from 'bun:test'; // Use only Bun's expect
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend Bun's expect with Testing Library matchers
expect.extend(matchers);

// Optional: Run Testing Library's cleanup after each test
afterEach(() => {
  cleanup();
});
