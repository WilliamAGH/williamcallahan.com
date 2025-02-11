/**
 * Window Mock Setup
 *
 * CRITICAL: This file must be loaded before any React or Testing Library imports
 * because they require the window.document object to exist.
 *
 * This file creates a minimal window mock with all required properties,
 * including document, Events, and other DOM APIs needed for testing.
 *
 * Order of operations:
 * 1. environment.ts - Sets up Node environment and env variables
 * 2. window.ts (this file) - Creates window mock with document object
 * 3. jest.setup.js - Sets up polyfills
 * 4. jest.setup.ts - Sets up test utilities and mocks
 * 5. react.ts - Sets up React and Testing Library
 */

// Create a mock element factory
const createMockElement = () => ({
  setAttribute: jest.fn(),
  getAttribute: jest.fn(),
  hasAttribute: jest.fn(),
  removeAttribute: jest.fn(),
  classList: {
    add: jest.fn(),
    remove: jest.fn(),
    contains: jest.fn(),
    toggle: jest.fn()
  },
  style: {},
  children: [],
  childNodes: [],
  parentNode: null,
  appendChild: jest.fn(),
  removeChild: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  dispatchEvent: jest.fn(),
  textContent: '',
  innerText: '',
  innerHTML: '',
  focus: jest.fn(),
  blur: jest.fn()
});

// Set up minimal window mock with required properties
const windowMock = {
  Events: {},
  __DEV__: true,
  document: {
    createElement: jest.fn((tagName) => createMockElement()),
    createTextNode: jest.fn(() => ({ textContent: '' })),
    documentElement: {
      style: {},
      setAttribute: jest.fn(),
      getAttribute: jest.fn(),
      hasAttribute: jest.fn(),
      removeAttribute: jest.fn()
    },
    querySelector: jest.fn(),
    querySelectorAll: jest.fn(() => []),
    getElementById: jest.fn(),
    getElementsByClassName: jest.fn(() => []),
    getElementsByTagName: jest.fn(() => []),
    body: {
      ...createMockElement(),
      appendChild: jest.fn(),
      removeChild: jest.fn()
    },
    head: {
      ...createMockElement(),
      appendChild: jest.fn(),
      removeChild: jest.fn()
    },
    createEvent: jest.fn((type) => ({
      initEvent: jest.fn(),
      preventDefault: jest.fn(),
      stopPropagation: jest.fn()
    }))
  },
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  dispatchEvent: jest.fn(),
  getComputedStyle: jest.fn(() => ({
    getPropertyValue: jest.fn(),
    setProperty: jest.fn()
  })),
  matchMedia: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn()
  })),
  location: {
    href: 'http://localhost',
    pathname: '/',
    search: '',
    hash: '',
    assign: jest.fn(),
    replace: jest.fn()
  },
  history: {
    pushState: jest.fn(),
    replaceState: jest.fn(),
    go: jest.fn(),
    back: jest.fn(),
    forward: jest.fn()
  },
  localStorage: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn()
  },
  sessionStorage: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn()
  },
  requestAnimationFrame: jest.fn(cb => setTimeout(cb, 0)),
  cancelAnimationFrame: jest.fn(),
  setTimeout: jest.fn(),
  clearTimeout: jest.fn(),
  setInterval: jest.fn(),
  clearInterval: jest.fn(),
  MutationObserver: jest.fn(function() {
    return {
      observe: jest.fn(),
      disconnect: jest.fn(),
      takeRecords: jest.fn()
    };
  }),
  ResizeObserver: jest.fn(function() {
    return {
      observe: jest.fn(),
      unobserve: jest.fn(),
      disconnect: jest.fn()
    };
  }),
  IntersectionObserver: jest.fn(function() {
    return {
      observe: jest.fn(),
      unobserve: jest.fn(),
      disconnect: jest.fn()
    };
  })
} as any;

// Ensure global matches window
global.window = windowMock;
global.document = windowMock.document;
global.navigator = {
  userAgent: 'node.js',
  language: 'en-US',
  languages: ['en-US', 'en']
} as any;

// Export for use in tests if needed
export { windowMock };
