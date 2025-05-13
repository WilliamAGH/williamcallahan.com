/**
 * Test Utilities
 *
 * Common utilities and setup functions for tests.
 *
 * Note: This file uses `jest.fn()`. While `bun:test` provides compatibility
 * for `jest.fn()`, be mindful if more complex Jest-specific mock features
 * are added here in the future. Tests intended *only* for the Jest runner
 * should be named `*.jest.test.ts` or `*.jest.spec.ts`.
 *
 * The `bun run test` command executes both `bun test` (for standard tests)
 * and the Jest runner (for `*.jest.*` files) sequentially.
 */
import { jest } from 'bun:test'; // Ensure jest namespace is available if running via bun
import { config } from 'dotenv';
import path from 'path';
import { afterEach, beforeAll } from 'bun:test';
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