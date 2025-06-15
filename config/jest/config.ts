/* eslint-disable no-useless-escape */
import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: "./",
});

// Add any custom config to be passed to Jest
const config: Config = {
  rootDir: "../../",
  coverageProvider: "v8",
  testEnvironment: "jsdom",
  // Add more setup options before each test is run
  setupFilesAfterEnv: ["<rootDir>/config/jest/setup.ts"],
  setupFiles: ["<rootDir>/config/jest/polyfills.js"],

  // Module directories
  moduleDirectories: ["node_modules", "<rootDir>/"],

  // Test patterns
  testMatch: [
    "**/__tests__/**/*.(test|spec).(ts|tsx|js|jsx)",
    "**/?(*.)+(spec|test).(ts|tsx|js|jsx)",
  ],

  // Module path aliases matching tsconfig.json
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^~/(.*)$": "<rootDir>/$1",
    // Handle CSS imports (with CSS modules)
    "^.+\\.module\\.(css|sass|scss)$": "identity-obj-proxy",
    // Handle CSS imports (without CSS modules)
    "^.+\\.(css|sass|scss)$": "<rootDir>/__tests__/__mocks__/lib/style-mock.js",
    // Handle image imports
    "^.+\\.(png|jpg|jpeg|gif|webp|avif|ico|bmp|svg)$/i":
      "<rootDir>/__tests__/__mocks__/lib/file-mock.js",
    // Handle @sentry/nextjs
    "^@sentry/nextjs$": "<rootDir>/__tests__/__mocks__/sentry.js",
    // Mock node-fetch
    "^node-fetch$": "<rootDir>/__tests__/__mocks__/node-fetch.js",
  },

  // Ignore patterns
  testPathIgnorePatterns: [
    "<rootDir>/node_modules/",
    "<rootDir>/.next/",
    "<rootDir>/__tests__/lib/bookmarks-s3-external-sync.unit.test.ts",
    "<rootDir>/__tests__/blog/blog.smoke.test.ts",
    "<rootDir>/__tests__/components/ui/navigation/navigation.test.tsx",
    "<rootDir>/__tests__/components/ui/navigation/navigation-link.test.tsx",
  ],

  // Transform ignore patterns - allow Jest to transform these ESM packages
  transformIgnorePatterns: [
    "/node_modules/(?!(next-mdx-remote|uuid|@aws-sdk|@mdx-js|cheerio|gray-matter|remark-.*|rehype-.*|unified|unist-.*|mdast-.*|hast-.*|micromark.*|decode-named-character-reference|character-entities|parse-entities|stringify-entities|zwitch|longest-streak|mdurl|uc.micro|property-information|space-separated-tokens|comma-separated-tokens|web-namespaces|html-void-elements|node-fetch)/)/",
    "^.+\\.module\\.(css|sass|scss)$",
  ],

  // Coverage collection
  collectCoverageFrom: [
    "**/*.{js,jsx,ts,tsx}",
    "!**/*.d.ts",
    "!**/node_modules/**",
    "!**/.next/**",
    "!**/*.config.js",
    "!**/*.config.ts",
    "!**/coverage/**",
    "!**/types/**",
  ],

  // Automatically clear mock calls, instances, contexts and results before every test
  clearMocks: true,

  // Indicates whether the coverage information should be collected while executing the test
  collectCoverage: false,

  // The directory where Jest should output its coverage files
  coverageDirectory: "coverage",

  // Maximum number of concurrent workers
  maxWorkers: "50%",

  // Verbose output
  verbose: true,

  // Global timeout
  testTimeout: 20000,
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
export default createJestConfig(config);
