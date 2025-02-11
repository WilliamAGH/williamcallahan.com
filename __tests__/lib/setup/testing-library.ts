/**
 * Testing Library Setup
 *
 * This file handles setup for both @testing-library/jest-dom and @testing-library/react.
 * It must run after the test environment is initialized but before any tests execute.
 *
 * Order of operations:
 * 1. environment.ts - Sets up Node environment and env variables
 * 2. window.ts - Creates window mock with document object
 * 3. jest.setup.js - Sets up polyfills
 * 4. testing-library.ts (this file) - Sets up Testing Library and jest-dom
 * 5. jest.setup.ts - Sets up remaining test utilities
 */

import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';

// Configure React Testing Library
configure({
  testIdAttribute: 'data-testid',
  asyncUtilTimeout: 5000,
  throwSuggestions: true
});
