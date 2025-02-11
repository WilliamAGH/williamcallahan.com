/**
 * Theme Testing Setup
 *
 * Provides utilities for setting up theme-related test environment.
 * This includes setting the data-theme-ready attribute and mocking
 * system theme detection via matchMedia.
 */

/**
 * Set up theme readiness and system theme detection for tests
 * @param prefersDark - Whether to mock system preference as dark theme
 */
export const setupThemeReadiness = (prefersDark = false) => {
  // Set data-theme-ready attribute to simulate theme-init.js completion
  document.documentElement.setAttribute('data-theme-ready', 'true');

  // Mock matchMedia for system theme detection
  window.matchMedia = jest.fn().mockImplementation(query => ({
    matches: query === '(prefers-color-scheme: dark)' ? prefersDark : !prefersDark,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
};
