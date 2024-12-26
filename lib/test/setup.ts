/**
 * Test Utilities
 * 
 * Common utilities and setup functions for tests.
 */

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