/**
 * Jest Configuration
 *
 * CRITICAL: The order of setup files is important!
 * Files must be loaded in this exact order to ensure proper test environment setup:
 *
 * 1. environment.ts - Sets up Node environment and env variables
 * 2. window.ts - Creates window mock with document object
 * 3. jest.setup.js - Sets up polyfills
 * 4. jest.setup.ts - Sets up test utilities and mocks
 * 5. react.ts - Sets up React and Testing Library
 */

const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
  reactEnvironment: 'jsdom',
  testEnvironmentOptions: {
    customExportConditions: ['react-native', 'node']
  }
});

const customJestConfig = {
  // Setup files run before test environment is setup
  setupFiles: [
    // 1. Set up Node environment and env variables
    '<rootDir>/__tests__/lib/setup/environment.ts',
    // 2. Create window mock with document object
    '<rootDir>/__tests__/lib/setup/window.ts'
  ],
  // Setup files that run after test environment is setup
  setupFilesAfterEnv: [
    // 3. Set up polyfills
    '<rootDir>/jest.setup.js',
    // 4. Set up test utilities and mocks
    '<rootDir>/__tests__/lib/setup/jest.setup.ts',
    // 5. Set up React and Testing Library (must be last)
    '<rootDir>/__tests__/lib/setup/react.ts'
  ],
  moduleDirectories: ['node_modules', '<rootDir>'],
  testEnvironment: 'jest-environment-jsdom',
  testEnvironmentOptions: {
    customExportConditions: [''],  // Prevent Node.js export conditions
    url: 'http://localhost'        // Set base URL for jsdom
  },
  moduleNameMapper: {
    '^react$': '<rootDir>/node_modules/react/cjs/react.development.js',
    '^react-dom$': '<rootDir>/node_modules/react-dom/cjs/react-dom.development.js',
    '^react-dom/test-utils$': '<rootDir>/node_modules/react-dom/cjs/react-dom-test-utils.development.js'
  },
  coverageThreshold: {
    global: {
      statements: 65,
      branches: 55,
      functions: 75,
      lines: 65
    }
  },
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/'
  ],
  transformIgnorePatterns: [
    '/node_modules/(?!(node-fetch)/)',
    '^.+\\.module\\.(css|sass|scss)$'
  ],
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.json'
    }
  }
};

module.exports = createJestConfig(customJestConfig);
