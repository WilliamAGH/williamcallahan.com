// __tests__/lib/setup/testing-library.ts
/**
 * Testing Library Setup for Vitest
 *
 * This file registers Testing Library matchers and ensures cleanup runs
 * after each test when imported.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
