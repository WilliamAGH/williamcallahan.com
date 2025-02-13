/**
 * Jest Configuration
 *
 * CRITICAL: The order of setup files is important!
 * Files must be loaded in this exact order to ensure proper test environment setup:
 *
 * 1. environment.ts - Sets up Node environment and env variables
 * 2. window.ts - Creates window mock with document object
 * 3. jest.setup.js - Sets up polyfills and mocks
 * 4. testing-library.ts - Sets up Testing Library and jest-dom
 * 5. react.ts - Sets up React and Testing Library
 */

const nextJest = require("next/jest");

const createJestConfig = nextJest({
  dir: "./",
  reactEnvironment: "jsdom",
  testEnvironmentOptions: {
    customExportConditions: ["react-native", "node"]
  }
});

const customJestConfig = {
  // Setup files run before test environment is setup
  setupFiles: [
    // 1. Set up Node environment and env variables
    "<rootDir>/__tests__/lib/setup/environment.ts",
    // 2. Create window mock with document object
    "<rootDir>/__tests__/lib/setup/window.ts"
  ],
  // Setup files that run after test environment is setup
  setupFilesAfterEnv: [
    // 3. Set up polyfills and mocks
    "<rootDir>/jest.setup.js",
    // 4. Add extended jest-dom matchers
    "<rootDir>/__tests__/lib/setup/testingLibrary.ts",
    // 5. Set up React and Testing Library (must be last)
    "<rootDir>/__tests__/lib/setup/react.ts"
  ],
  moduleDirectories: ["node_modules", "<rootDir>"],
  testEnvironment: "jest-environment-jsdom",
  testEnvironmentOptions: {
    customExportConditions: [""],  // Prevent Node.js export conditions
    url: "http://localhost"        // Set base URL for jsdom
  },
  moduleNameMapper: {
    // Base path aliases
    "^@/(.*)$": "<rootDir>/$1",
    "^@components/(.*)$": "<rootDir>/components/$1",
    "^@lib/(.*)$": "<rootDir>/lib/$1",
    "^@app/(.*)$": "<rootDir>/app/$1",
    // UI components specific mappings
    "^@ui/(.*)$": "<rootDir>/components/ui/$1",
    "^@terminal/(.*)$": "<rootDir>/components/ui/terminal/$1",
    // Test utilities
    "^@test/(.*)$": "<rootDir>/__tests__/$1",
    "^@test-utils/(.*)$": "<rootDir>/__tests__/lib/$1",
    // Handle style imports
    "\\.(css|less|scss|sass)$": "<rootDir>/__tests__/lib/setup/mocks.ts",
    // Handle asset imports
    "\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$": "<rootDir>/__tests__/lib/setup/mocks.ts",
    // Add MDX handling
    '^next-mdx-remote/serialize$': '<rootDir>/__mocks__/next-mdx-remote/serialize.js',
    '^next-mdx-remote$': '<rootDir>/__mocks__/next-mdx-remote.js'
  },
  moduleDirectories: [
    "node_modules",
    "<rootDir>"
  ],
  extensionsToTreatAsEsm: [".ts", ".tsx"],
  transform: {
    "^.+\\.(js|jsx|ts|tsx)$": ["babel-jest", { configFile: './.babelrc.test.js' }]
  },
  coverageThreshold: {
    global: {
      statements: 64,
      branches: 46,
      functions: 64,
      lines: 65
    }
  },
  testPathIgnorePatterns: [
    "<rootDir>/.next/",
    "<rootDir>/node_modules/",
    "<rootDir>/__tests__/lib/setup/",
    "<rootDir>/__tests__/lib/fixtures/",
    "<rootDir>/.babelrc.test.js"
  ],
  transformIgnorePatterns: [
    "^.+\\.module\\.(css|sass|scss)$",
    "/node_modules/(?!rehype-prism|next-mdx-remote)"
  ],
  globals: {
    "ts-jest": {
      tsconfig: "<rootDir>/tsconfig.json"
    }
  },
  // Automatically clear mock calls and instances between every test
  clearMocks: true,
  // Indicates whether the coverage information should be collected while executing the test
  collectCoverage: true,
  // The directory where Jest should output its coverage files
  coverageDirectory: "coverage",
  // An array of regexp pattern strings used to skip coverage collection
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "/__tests__/",
    "/coverage/"
  ],
  // A list of reporter names that Jest uses when writing coverage reports
  coverageReporters: [
    "json",
    "text",
    "lcov",
    "clover"
  ],
  // An array of file extensions your modules use
  moduleFileExtensions: [
    "js",
    "jsx",
    "ts",
    "tsx",
    "json",
    "node"
  ]
};

module.exports = createJestConfig(customJestConfig);
