// __tests__/lib/setup/theme.ts

/**
 * Theme Testing Setup
 *
 * Provides utilities for setting up theme-related test environment.
 * This includes setting the data-theme-ready attribute, mocking
 * system theme detection via matchMedia, and simulating theme
 * initialization events.
 */

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn(),
  removeItem: jest.fn()
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock performance API
if (!window.performance) {
  window.performance = {} as Performance;
}
window.performance.mark = jest.fn();
window.performance.measure = jest.fn();

// Mock requestAnimationFrame
window.requestAnimationFrame = jest.fn(cb => setTimeout(cb, 0));

/**
 * Set up theme readiness and system theme detection for tests
 * @param prefersDark - Whether to mock system preference as dark theme
 * @param status - Theme initialization status ('true', 'error', or undefined for not ready)
 */
export const setupThemeReadiness = (prefersDark = false, status?: 'true' | 'error') => {
  // Set theme ready status
  if (status) {
    document.documentElement.setAttribute('data-theme-ready', status);
  } else {
    document.documentElement.removeAttribute('data-theme-ready');
  }

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

  // Simulate theme system ready event if status is 'true'
  if (status === 'true') {
    window.dispatchEvent(new Event('themeSystemReady'));
  }
};

/**
 * Clean up theme testing setup
 */
export const cleanupThemeSetup = () => {
  document.documentElement.removeAttribute('data-theme-ready');
  document.documentElement.classList.remove('dark');
  jest.restoreAllMocks();
  localStorageMock.getItem.mockReset();
  localStorageMock.setItem.mockReset();
  localStorageMock.clear.mockReset();
};

// Set up default theme environment
setupThemeReadiness(false, 'true');

/**
 * Theme Testing Setup
 *
 * Provides mock implementation for next-themes
 */

import { useTheme } from 'next-themes';

export const mockTheme = {
  theme: 'light',
  setTheme: jest.fn(),
  systemTheme: 'light',
  themes: ['light', 'dark', 'system'],
};

jest.mock('next-themes', () => ({
  useTheme: jest.fn(() => mockTheme),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));
