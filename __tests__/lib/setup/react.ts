/**
 * React and Testing Library Setup
 *
 * CRITICAL: This file must be loaded LAST in the setup sequence
 * because it requires the window.document object to be fully set up.
 *
 * Order of operations:
 * 1. environment.ts - Sets up Node environment and env variables
 * 2. window.ts - Creates window mock with document object
 * 3. jest.setup.js - Sets up polyfills
 * 4. jest.setup.ts - Sets up test utilities and mocks
 * 5. react.ts (this file) - Sets up React and Testing Library
 */

import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';

// Configure React Testing Library
configure({
  asyncUtilTimeout: 5000,
  throwSuggestions: true
});
