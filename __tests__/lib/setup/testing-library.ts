// __tests__/lib/setup/testing-library.ts
import { afterEach, expect } from 'bun:test'; // Use only Bun's expect
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend Bun's expect with Testing Library matchers
expect.extend(matchers);

// Optional: Run Testing Library's cleanup after each test
afterEach(() => {
  cleanup();
});
