/**
 * @file Jest configuration for Next.js ESM project
 * @description Jest configuration that works with ESM and next/jest
 *
 * 🚨 CRITICAL WARNING: NEVER use `bun test` directly!
 *
 * ❌ FORBIDDEN:
 * - bun test
 * - bun test --watch
 * - bun test [filename]
 *
 * ✅ REQUIRED - Always use npm/bun run scripts:
 * - bun run test
 * - bun run test:watch
 * - bun run test:coverage
 * - bun run test:ci
 * - bun run test:smoke
 *
 * Direct `bun test` bypasses this configuration entirely and causes:
 * - jest.mock is not defined errors
 * - Module resolution failures
 * - DOM/JSDOM errors
 * - Mock system failures
 * - Setup file skipping
 *
 * This configuration file ONLY works when loaded through npm/bun run scripts!
 */
import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  dir: "./",
});

const config: Config = {
  // Basic setup
  rootDir: "../../",
  testEnvironment: "jsdom",

  // Setup files
  setupFilesAfterEnv: ["<rootDir>/config/jest/setup.ts"],
  setupFiles: ["<rootDir>/config/jest/polyfills.js", "<rootDir>/config/jest/global-mocks.ts"],

  // Module resolution
  moduleDirectories: ["node_modules", "<rootDir>/"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],

  // Path aliases
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^~/(.*)$": "<rootDir>/$1",
    // CSS and assets
    "^.+\\.module\\.(css|sass|scss)$": "identity-obj-proxy",
    "^.+\\.(css|sass|scss)$": "<rootDir>/__tests__/__mocks__/lib/style-mock.js",
    "^.+\\.(png|jpg|jpeg|gif|webp|avif|ico|bmp|svg)$/i": "<rootDir>/__tests__/__mocks__/lib/file-mock.js",
    // Next.js mocks
    "^next/navigation$": "<rootDir>/__tests__/__mocks__/next/navigation.js",
    "^next/image$": "<rootDir>/__tests__/__mocks__/next/image.js",
    "^next/server$": "<rootDir>/__tests__/__mocks__/next/server.js",
    "^next/cache$": "<rootDir>/__tests__/__mocks__/next/cache.js",
    "^next-themes$": "<rootDir>/__tests__/__mocks__/next-themes.js",
    // Library mocks
    "^@sentry/nextjs$": "<rootDir>/__tests__/__mocks__/sentry.js",
    "^cheerio$": "<rootDir>/__tests__/__mocks__/lib/cheerio.js",
    "^next-mdx-remote/serialize$": "<rootDir>/__tests__/__mocks__/lib/next-mdx-remote.js",
    "^next-mdx-remote$": "<rootDir>/__tests__/__mocks__/lib/next-mdx-remote.js",
    "^@/lib/data-access/github$": "<rootDir>/__tests__/__mocks__/lib/data-access/github.ts",
    // Bookmarks mock
    "^@/lib/bookmarks/bookmarks-data-access.server$": "<rootDir>/__tests__/__mocks__/lib/data-access/bookmarks.ts",
  },

  // Test patterns
  testMatch: ["**/__tests__/**/*.(test|spec).(ts|tsx|js|jsx)", "**/?(*.)+(spec|test).(ts|tsx|js|jsx)"],

  // Ignore patterns
  testPathIgnorePatterns: ["<rootDir>/node_modules/", "<rootDir>/.next/", "<rootDir>/types/test.ts"],

  // Transform configuration for ESM
  transform: {
    "^.+\\.(ts|tsx)$": "ts-jest",
  },
  transformIgnorePatterns: ["/node_modules/", "\\.pnpm/."],

  // Coverage
  collectCoverageFrom: [
    "**/*.{js,jsx,ts,tsx}",
    "!**/*.d.ts",
    "!**/node_modules/**",
    "!**/.next/**",
    "!**/*.config.*",
    "!**/coverage/**",
    "!**/types/**",
  ],

  // General settings
  clearMocks: true,
  collectCoverage: false,
  coverageDirectory: "coverage",
  coverageProvider: "v8",
  maxWorkers: "50%",
  verbose: true,
  testTimeout: 20000,

  // Environment options for jsdom
  testEnvironmentOptions: {
    url: "http://localhost:3000",
  },
};

export default createJestConfig(config);
