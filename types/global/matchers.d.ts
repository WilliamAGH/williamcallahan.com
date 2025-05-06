// types/global/matchers.d.ts
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';
import type { Matchers } from 'bun:test';

declare namespace Jest {
  interface Matchers<R, T = unknown> {
    advanceTimersByTime(ms: number): void;
    useFakeTimers(): void;
    useRealTimers(): void;
  }
}

declare global {
  var jest: {
    advanceTimersByTime(ms: number): void;
    useFakeTimers(): void;
    useRealTimers(): void;
  };
}

declare module 'bun:test' {
  interface Matchers<T = unknown>
    extends TestingLibraryMatchers<typeof expect.stringContaining, T>,
            Jest.Matchers<void, T> {}

  // Extend the interface for asymmetric matchers (e.g., expect.any(String))
  // Note: Bun's types might not explicitly have AsymmetricMatchers in the same way Jest does.
  // We extend the base Matchers interface, as TestingLibraryMatchers covers both.
  // If asymmetric matchers cause issues, this part might need adjustment based on bun:test specifics.
}
