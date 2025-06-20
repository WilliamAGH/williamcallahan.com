// types/global/matchers.d.ts
import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

declare namespace Jest {
  interface Matchers {
    advanceTimersByTime(ms: number): void;
    useFakeTimers(): void;
    useRealTimers(): void;
  }
}

declare global {
  // Using let instead of var for global declarations
  let jest: {
    advanceTimersByTime(ms: number): void;
    useFakeTimers(): void;
    useRealTimers(): void;
  };
  // Must be var for React compatibility

  let IS_REACT_ACT_ENVIRONMENT: boolean;
}

declare module "bun:test" {
  interface Matchers<T = unknown>
    extends TestingLibraryMatchers<typeof expect.stringContaining, T>,
      Jest.Matchers<void, T> {}

  // Extend the interface for asymmetric matchers (e.g., expect.any(String))
  // Note: Bun's types might not explicitly have AsymmetricMatchers in the same way Jest does.
  // We extend the base Matchers interface, as TestingLibraryMatchers covers both.
  // If asymmetric matchers cause issues, this part might need adjustment based on bun:test specifics.
}
