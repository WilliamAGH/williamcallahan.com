import '@testing-library/jest-dom';

// Polyfill for setImmediate
global.setImmediate = (callback) => setTimeout(callback, 0);

// Mock process.env for tests
process.env.NEXT_PUBLIC_SITE_URL = 'https://williamcallahan.com';

// Mock window object if it doesn't exist (for Node environment)
if (typeof window === 'undefined') {
  global.window = {};
}

// Mock window.matchMedia
Object.defineProperty(global.window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});
