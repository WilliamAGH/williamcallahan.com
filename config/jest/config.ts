/* eslint-disable no-useless-escape */
/**
 * @file Jest configuration for Next.js
 * @description Sets up Jest for a Next.js project using `next/jest`
 * Includes path aliases, module mappers for assets, and transform ignores
 */
import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  /**
   * Path to Next.js app to load next.config.js and .env files
   */
  dir: "./",
});

/**
 * Custom Jest configuration
 */
const config: Config = {
  /**
   * Root directory for tests and modules
   */
  rootDir: "../../",
  /**
   * Coverage provider
   */
  coverageProvider: "v8",
  /**
   * Test environment for browser-like testing
   */
  testEnvironment: "jsdom",
  /**
   * Setup files to run before each test file
   */
  setupFilesAfterEnv: ["<rootDir>/config/jest/setup.ts"],
  /**
   * Setup files to run before the test environment is set up
   */
  setupFiles: ["<rootDir>/config/jest/polyfills.js"],

  /**
   * Directories to search for modules
   */
  moduleDirectories: ["node_modules", "<rootDir>/"],

  /**
   * Glob patterns for test file detection
   */
  testMatch: ["**/__tests__/**/*.(test|spec).(ts|tsx|js|jsx)", "**/?(*.)+(spec|test).(ts|tsx|js|jsx)"],

  /**
   * Maps module paths to different modules, used for mocking
   */
  moduleNameMapper: {
    // Path aliases from tsconfig.json
    "^@/(.*)$": "<rootDir>/$1",
    "^~/(.*)$": "<rootDir>/$1",
    // Mock CSS modules
    "^.+\\.module\\.(css|sass|scss)$": "identity-obj-proxy",
    // Mock other static assets
    "^.+\\.(css|sass|scss)$": "<rootDir>/__tests__/__mocks__/lib/style-mock.js",
    "^.+\\.(png|jpg|jpeg|gif|webp|avif|ico|bmp|svg)$/i": "<rootDir>/__tests__/__mocks__/lib/file-mock.js",
    // Mock specific libraries
    "^@sentry/nextjs$": "<rootDir>/__tests__/__mocks__/sentry.js",
    "^node-fetch$": "<rootDir>/__tests__/__mocks__/node-fetch.js",
    // Force cheerio to use a lightweight stub in tests to avoid ESM parsing issues
    "^cheerio$": "<rootDir>/__tests__/__mocks__/lib/cheerio.js",
    // Mock ESM-only packages
    "^next-mdx-remote/serialize$": "<rootDir>/__tests__/__mocks__/lib/next-mdx-remote.js",
    "^next-mdx-remote$": "<rootDir>/__tests__/__mocks__/lib/next-mdx-remote.js",
    "^rehype-autolink-headings$": "<rootDir>/__tests__/__mocks__/lib/markdown-plugins.js",
    "^rehype-slug$": "<rootDir>/__tests__/__mocks__/lib/markdown-plugins.js",
    "^remark-gfm$": "<rootDir>/__tests__/__mocks__/lib/markdown-plugins.js",
    "^@mapbox/rehype-prism$": "<rootDir>/__tests__/__mocks__/lib/markdown-plugins.js",
    // Ensure server-side bookmarks data access can be mocked via '@/lib/bookmarks'
    "^@/lib/bookmarks/bookmarks-data-access.server$": "<rootDir>/lib/bookmarks",
  },

  /**
   * Regex patterns for test paths to skip
   */
  testPathIgnorePatterns: [
    "<rootDir>/node_modules/",
    "<rootDir>/.next/",
    "<rootDir>/__tests__/lib/bookmarks/bookmarks-s3-external-sync.unit.test.ts",
    "<rootDir>/__tests__/components/ui/navigation/navigation.test.tsx",
    "<rootDir>/__tests__/components/ui/navigation/navigation-link.test.tsx",
    "<rootDir>/types/test.ts",
  ],

  /**
   * Regex patterns for source file paths to not transform
   * Allows transforming specific ESM-only packages in node_modules
   */
  transformIgnorePatterns: [
    "/node_modules/(?!(next-mdx-remote|uuid|@aws-sdk|@mdx-js|cheerio|gray-matter|remark-.*|rehype-.*|unified|unist-.*|mdast-.*|hast-.*|micromark.*|decode-named-character-reference|character-entities|parse-entities|stringify-entities|zwitch|longest-streak|mdurl|uc.micro|property-information|space-separated-tokens|comma-separated-tokens|web-namespaces|html-void-elements|node-fetch)/)/",
    "^.+\\.module\\.(css|sass|scss)$",
  ],

  /**
   * Glob patterns for files to include in coverage collection
   */
  collectCoverageFrom: [
    "**/*.{js,jsx,ts,tsx}",
    "**/*.{js,jsx,ts,tsx}",
    "!**/*.d.ts",
    "!**/node_modules/**",
    "!**/.next/**",
    "!**/*.config.js",
    "!**/*.config.ts",
    "!**/coverage/**",
    "!**/types/**",
  ],

  /**
   * Automatically clear mock data before every test
   */
  clearMocks: true,

  /**
   * Indicates if coverage information should be collected
   */
  collectCoverage: false,

  /**
   * Directory for Jest coverage files
   */
  coverageDirectory: "coverage",

  /**
   * Maximum number of workers for running tests
   */
  maxWorkers: "50%",

  /**
   * Report each individual test during the run
   */
  verbose: true,

  /**
   * Default test timeout in milliseconds
   */
  testTimeout: 20000,
};

/**
 * Exports createJestConfig to ensure next/jest can load the async Next.js config
 */
export default createJestConfig(config);
