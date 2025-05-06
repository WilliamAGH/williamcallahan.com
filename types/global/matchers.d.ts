// types/global/matchers.d.ts
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';
import type { Matchers } from 'bun:test'; // Import Matchers type from bun:test

// Extend the bun:test module declarations
declare module 'bun:test' {
  // Extend the interface for synchronous matchers
  interface Matchers<T = unknown> // Use default type parameter 'unknown'
    extends TestingLibraryMatchers<typeof expect.stringContaining, T> {}

  // Extend the interface for asymmetric matchers (e.g., expect.any(String))
  // Note: Bun's types might not explicitly have AsymmetricMatchers in the same way Jest does.
  // We extend the base Matchers interface, as TestingLibraryMatchers covers both.
  // If asymmetric matchers cause issues, this part might need adjustment based on bun:test specifics.
}