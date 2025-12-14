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
    // Image mocks - must match Next.js's exact patterns to override their 40x40 default
    // Next.js patterns from node_modules/next/dist/build/jest/jest.js
    "^.+\\.(png|jpg|jpeg|gif|webp|avif|ico|bmp)$": "<rootDir>/__tests__/__mocks__/lib/file-mock.js",
    "^.+\\.(svg)$": "<rootDir>/__tests__/__mocks__/lib/file-mock.js",
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
    "^plaiceholder$": "<rootDir>/__tests__/__mocks__/lib/plaiceholder.js",
    // Note: avoid globally mocking markdown plugins; use per-test strategies when needed
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
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/__tests__/tsconfig.json",
      },
    ],
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
    // Exclude all .gitignore patterns from coverage
    "!**/logs/**",
    "!**/*.log",
    "!**/npm-debug.log*",
    "!**/yarn-debug.log*",
    "!**/yarn-error.log*",
    "!**/pnpm-debug.log*",
    "!**/lerna-debug.log*",
    "!**/.next/**",
    "!**/dist/**",
    "!**/dist-ssr/**",
    "!**/*.local",
    "!**/.env*",
    "!**/.idea/**",
    "!**/.DS_Store",
    "!**/*.suo",
    "!**/*.ntvs*",
    "!**/*.njsproj",
    "!**/*.sln",
    "!**/*.sw?",
    "!**/.early.coverage/**",
    "!**/tsconfig.tsbuildinfo",
    "!**/.qodo/**",
    "!**/.env.sentry-build-plugin",
    "!**/data/github-projects/**",
    "!**/data/github-activity/**",
    "!**/data/bookmarks/**",
    "!**/data/images/logos/**",
    "!**/data/images/bookmarks/**",
    "!**/.populate-volumes-last-run-success",
    "!**/.jest-pre-compiled/**",
    // Additional common patterns that should be excluded
    "!**/scripts/**",
    "!**/public/**",
    "!**/__tests__/**",
    "!**/docs/**",
    "!**/config/**",
    "!**/middleware/**",
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
