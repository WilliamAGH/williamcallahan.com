/**
 * Jest Setup
 *
 * WE ALWAYS PREFER TESTING WITH REAL DATA IN THE APP OVER MOCK DATA WHEREVER POSSIBLE.
 * ALL TESTS IN THIS REPO ARE ONLY ALLOWED TO BE READ-ONLY.
 *
 * @description Sets up test environment with polyfills and global utilities.
 * Individual test files should handle their own mocks.
 */

// Add jest-dom matchers
import "@testing-library/jest-dom";

// Add custom matchers
expect.extend({
  toHaveBeenCalledOnceWith(received, ...expected) {
    const pass = received.mock.calls.length === 1 &&
      JSON.stringify(received.mock.calls[0]) === JSON.stringify(expected);

    return {
      pass,
      message: () =>
        pass
          ? `Expected ${received.getMockName()} not to have been called once with ${expected}`
          : `Expected ${received.getMockName()} to have been called once with ${expected}`
    };
  }
});

// React 18 Concurrent Mode Setup
global.IS_REACT_ACT_ENVIRONMENT = true;

// Ensure proper instanceof checks
global.HTMLElement = window.HTMLElement;
global.Element = window.Element;
global.Node = window.Node;

// Increase default timeout
jest.setTimeout(10000);

// Mock document.activeElement
const mockActiveElement = document.createElement('div');
mockActiveElement.setAttribute('data-testid', 'mock-active-element');
document.body.appendChild(mockActiveElement);

Object.defineProperty(document, 'activeElement', {
  configurable: true,
  get() {
    return mockActiveElement;
  }
});

// Polyfills for React 18 async operations
global.setImmediate = (callback) => setTimeout(callback, 0);
global.clearImmediate = (id) => clearTimeout(id);

// Mock requestAnimationFrame and cancelAnimationFrame
const createAnimationFrameMock = () => {
  const frameIds = new Set();
  let lastId = 0;

  global.requestAnimationFrame = jest.fn(callback => {
    const id = ++lastId;
    frameIds.add(id);
    Promise.resolve().then(() => {
      if (frameIds.has(id)) {
        callback(Date.now());
        frameIds.delete(id);
      }
    });
    return id;
  });

  global.cancelAnimationFrame = jest.fn(id => {
    frameIds.delete(id);
  });

  return () => {
    frameIds.clear();
    jest.clearAllMocks();
  };
};

// Mock window.matchMedia
Object.defineProperty(window, "matchMedia", {
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
  }))
});

// Mock ResizeObserver
class MockResizeObserver {
  constructor(callback) {
    this.callback = callback;
    this.observations = new Set();
  }
  observe(target) {
    this.observations.add(target);
  }
  unobserve(target) {
    this.observations.delete(target);
  }
  disconnect() {
    this.observations.clear();
    this.callback = null;
  }
}

// Mock IntersectionObserver
class MockIntersectionObserver {
  constructor(callback) {
    this.callback = callback;
    this.observations = new Set();
    this.root = null;
    this.rootMargin = "0px";
    this.thresholds = [0];
  }
  observe(target) {
    this.observations.add(target);
  }
  unobserve(target) {
    this.observations.delete(target);
  }
  disconnect() {
    this.observations.clear();
    this.callback = null;
  }
  takeRecords() {
    return [];
  }
}

// Mock MutationObserver
class MockMutationObserver {
  constructor(callback) {
    this.callback = callback;
    this.observations = new Set();
  }
  observe(target, options) {
    this.observations.add({ target, options });
  }
  disconnect() {
    this.observations.clear();
    this.callback = null;
  }
  takeRecords() {
    return [];
  }
}

// Install mocks
global.ResizeObserver = MockResizeObserver;
global.IntersectionObserver = MockIntersectionObserver;
global.MutationObserver = MockMutationObserver;

// Create cleanup function
const cleanupAnimationFrame = createAnimationFrameMock();

// Global beforeEach
beforeEach(() => {
  // Reset all mocks
  jest.clearAllMocks();

  // Clear any pending animation frames
  cleanupAnimationFrame();

  // Reset timers
  jest.useRealTimers();

  // Reset active element
  if (document.activeElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }
});

// Global afterEach
afterEach(async () => {
  // Wait for any pending state updates
  await new Promise(resolve => setTimeout(resolve, 0));

  // Ensure all pending timers are cleared
  jest.clearAllTimers();

  // Clear any pending animation frames
  cleanupAnimationFrame();

  // Reset active element
  if (document.activeElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }

  // Clean up any remaining event listeners
  document.body.innerHTML = '';
});

// Suppress specific console warnings
const originalError = console.error;
const originalWarn = console.warn;

console.error = (...args) => {
  const suppressedWarnings = [
    "Warning: ReactDOM.render is no longer supported",
    "Warning: You are importing createRoot from 'react-dom'",
    "Warning: The current testing environment is not configured to support act(...)",
    "Warning: Attempted to synchronously unmount a root while React was already rendering",
    "Warning: An update to TestComponent inside a test was not wrapped in act(...)"
  ];

  // Check for ENOENT errors or suppressed warnings
  const errorMessage = args[0]?.toString?.() || '';
  if (
    (typeof args[0] === "string" && suppressedWarnings.some(warning => args[0].includes(warning))) ||
    errorMessage.includes('ENOENT') ||
    (args[0]?.message?.includes?.('ENOENT')) ||
    errorMessage.includes('Should not already be working')
  ) {
    return;
  }
  originalError.call(console, ...args);
};

console.warn = (...args) => {
  const suppressedWarnings = [
    "Warning: useLayoutEffect does nothing on the server",
    "Warning: The current testing environment is not configured to support act(...)"
  ];

  if (
    typeof args[0] === "string" &&
    suppressedWarnings.some(warning => args[0].includes(warning))
  ) {
    return;
  }
  originalWarn.call(console, ...args);
};
