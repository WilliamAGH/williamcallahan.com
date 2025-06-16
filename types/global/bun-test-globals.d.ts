/// <reference types="bun-types" />

/**
 * Ambient global declarations for Bun's test runner APIs
 * including describe, test, expect, jest, etc.
 * This enables usage of describe.skip, test.skip, etc.
 */
declare global {
  /** Group related tests, supports .skip, .only, .todo, .each, etc. */
  const describe: import("bun:test").Describe;
  /** Alias for describe; runs a single test, supports .skip, .only, .todo, .each, etc. */
  const test: import("bun:test").Test;
  /** Alias for test */
  const it: import("bun:test").Test;

  /** Runs before all tests in a file */
  const beforeAll: typeof import("bun:test").beforeAll;
  /** Runs before each test */
  const beforeEach: typeof import("bun:test").beforeEach;
  /** Runs after all tests in a file */
  const afterAll: typeof import("bun:test").afterAll;
  /** Runs after each test */
  const afterEach: typeof import("bun:test").afterEach;

  /** Core assertion function, extended with matchers */
  const expect: import("bun:test").Expect;

  /** Jest-compatible API (fn, clearAllMocks, restoreAllMocks, etc.) */
  const jest: import("bun:test").Jest;

  /** Module mocking API */
  const mock: typeof import("bun:test").mock;

  /** Spy on object methods */
  const spyOn: typeof import("bun:test").spyOn;

  /** Freeze or restore system time */
  const setSystemTime: typeof import("bun:test").setSystemTime;
}

// no top-level import or export, this is a global script
export {};
