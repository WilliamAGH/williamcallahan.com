/**
 * Test Utilities
 *
 * Common utilities and setup functions for tests.
 *
 * Note: This file uses `jest.fn()` and Jest testing utilities. Tests intended
 * *only* for the Jest runner should be named `*.jest.test.ts` or `*.jest.spec.ts`.
 *
 * The `bun run test` command executes both `bun test` (for standard tests)
 * and the Jest runner (for `*.jest.*` files) sequentially.
 */
import '@testing-library/jest-dom';
import { config } from 'dotenv';
import * as path from 'node:path';
import { afterEach, beforeAll } from '@jest/globals';
import { cleanup } from '@testing-library/react';

// Explicitly load .env from project root
config({ path: path.resolve(process.cwd(), '.env') });

export function setupTests() {
  const mockRouter = {
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn()
  };

  return { mockRouter };
}

// Clean up rendered DOM elements after each test to avoid duplicates
afterEach(() => {
  cleanup();
});
