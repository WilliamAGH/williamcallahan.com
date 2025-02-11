/**
 * Jest Polyfills Setup
 *
 * IMPORTANT: This file only handles polyfills. All other setup is handled by:
 * 1. environment.ts - Sets up Node environment and env variables
 * 2. window.ts - Creates window mock with document object
 * 3. jest.setup.js (this file) - Sets up polyfills
 * 4. testing-library.ts - Sets up Testing Library and jest-dom
 * 5. jest.setup.ts - Sets up remaining test utilities
 *
 * Keep this file focused only on polyfills to maintain clear separation of concerns
 * and ensure proper initialization order.
 */

// Polyfill for setImmediate (required for React 18 async operations)
global.setImmediate = (callback) => setTimeout(callback, 0);
