# Testing Configuration

**Functionality:** `testing-config`

## Core Objective

Configure and setup the testing environment for both Jest and Bun test runners, providing type definitions, polyfills, mock implementations, and a comprehensive testing strategy for consistent test execution across the application.

## Testing Strategy

The project uses **Jest** as the primary test runner with a multi-layered testing strategy:

- **Unit Tests**: Focus on isolating and testing individual functions, utilities, and hooks. Essential for verifying business logic correctness in controlled environments.
- **Component Tests**: Using React Testing Library, these verify that React components render correctly and behave as expected in response to user interactions.
- **Integration Tests**: Verify interactions between different components and modules (e.g., testing form components with data-fetching services).
- **End-to-End (E2E) Smoke Tests**: High-level tests simulating basic user flows and validating key pages render without errors. Act as sanity checks for the integrated application.

## Why Jest?

Jest provides comprehensive testing framework support for:

- React component testing with React Testing Library
- JSDOM environment for DOM manipulation outside browsers
- Advanced mocking capabilities for functions, modules, and timers

## Test Directory Structure

All test-related files are located in the `__tests__` directory at the project root:

```
__tests__/
├── __mocks__/       # Manual mocks for modules
├── components/      # Tests for React components
├── lib/             # Tests for library/utility functions
└── ...              # Other test files, organized by feature
```

### File Naming Convention

Test files should be named with `.test.ts` or `.test.tsx` suffix (e.g., `utils.test.ts`, `Header.test.tsx`).

## Architecture & Key Components

### Type Definitions

#### `types/global/bun-test-globals.d.ts`

- Global type definitions for Bun test environment
- Declares global test functions and matchers specific to Bun

#### `types/global/matchers.d.ts`

- Custom matcher type definitions
- Extends Jest/Bun matcher interfaces with project-specific assertions

#### `types/jest-dom.jest.d.ts`

- Jest DOM matcher type augmentation
- Extends `@jest/expect` with Testing Library matchers
- Integrates `@testing-library/jest-dom` types

#### `types/jest-extended.d.ts`

- Custom Jest matcher types
- Declares `jest-extended` module
- Adds `toBeString()` matcher to global Jest namespace

### Jest Configuration

#### `jest.config.ts`

- Main Jest configuration file
- Configures test environment, module resolution, and transformations
- Sets up module name mappings for path aliases
- Specifies test file patterns and coverage settings

#### `jest.polyfills.js`

- Provides polyfills for Jest test environment
- Implements browser APIs not available in Node.js
- Ensures consistent test environment across different platforms

#### `jest.setup.ts`

- Jest setup file run before each test suite
- Configures global test utilities and matchers
- Sets up Testing Library and DOM environment

### Test Environment Setup

#### `__tests__/setup/testing-library.ts`

- Configures React Testing Library
- Sets up custom render functions
- Provides test utilities and helpers

#### `__tests__/setup/bun-setup.ts`

- Bun-specific test environment configuration
- Sets up globals and utilities for Bun tests
- Configures mock implementations

#### `__tests__/tsconfig.jest.json`

- TypeScript configuration specifically for Jest tests
- Extends base tsconfig with test-specific settings
- Configures module resolution for test files

### Mock Files

#### `__tests__/__mocks__/lib/file-mock.js`

- Mock implementation for static file imports
- Returns stub values for images, fonts, and other assets
- Prevents errors when importing non-JS files in tests

#### `__tests__/__mocks__/lib/style-mock.js`

- Mock for CSS and style imports
- Returns empty objects for style modules
- Allows component tests to run without CSS processing

### Utility Scripts

#### `scripts/fix-fetch-mock.ts`

- Script to fix or update fetch mock implementations
- Ensures compatibility between different test environments
- Handles fetch polyfill configuration

### Test Runner Scripts

#### `scripts/bun-test-wrapper.sh`

- Wrapper to prevent direct `bun test` usage
- Intercepts `bun test` commands without arguments
- Directs users to use proper npm scripts
- Passes through other bun commands unchanged

#### `scripts/run-tests.sh`

- Main test runner script
- Runs tests with HappyDOM and Testing Library setup
- Mocks NodeCache for server-side cache testing
- Uses Bun test runner under the hood

#### `scripts/run-bun-tests.sh`

- Simple Bun test executor
- Delegates to `bun run test` using root configuration

#### `scripts/setup-test-alias.sh`

- Shell alias installer
- Detects shell type (zsh/bash)
- Creates `_bun_wrapper` function to intercept test commands
- Prevents accidental direct test execution

### Test Support Scripts

#### `scripts/check-file-naming.ts`

- React component naming convention validator
- Validates `.client.tsx` files have `'use client'` directive
- Validates `.server.tsx` files lack `'use client'` directive
- Enforces kebab-case file naming
- Detects browser API usage in server components
- Returns error codes for CI integration

#### `scripts/fix-test-imports.sh`

- Import path fixer
- Uses `sed` to fix relative import paths in test files
- Handles both Jest and Bun test file imports
- Corrects over-corrected paths from previous fixes

### Missing Test Scripts

#### `scripts/test-github-api.ts`

- Referenced but doesn't exist
- Intended for testing GitHub API integration

#### `scripts/test-terminal.ts`

- Referenced but doesn't exist
- Intended for testing terminal functionality

## Configuration Flow

1. **Test Runner Selection**
   - Jest for React component tests
   - Bun for server-side and integration tests

2. **Environment Setup**
   - Test runner loads respective config (jest.config.ts or bun-setup.ts)
   - Polyfills and global utilities are initialized
   - Type definitions augment test interfaces

3. **Module Resolution**
   - Path aliases are resolved according to tsconfig
   - Static assets and styles are mocked
   - Custom matchers are registered

4. **Test Execution**
   - Tests run in configured environment
   - Mocks intercept external dependencies
   - Results are collected and reported

## Integration Points

- **CI/CD Pipeline**: Configurations ensure consistent test behavior
- **Development**: Type definitions provide IDE support
- **Build Process**: Mock files prevent asset loading errors
- **Coverage Reports**: Jest config defines coverage thresholds

## Security & Performance Issues

### 🟡 MEDIUM Priority Issues

1. **Shell Injection Risk** (`scripts/setup-test-alias.sh`)
   - Uses unescaped shell expansion with `cat >> "$SHELL_RC"`
   - Could be exploited if `$HOME` contains special characters
   - **Fix**: Use proper quoting or alternative methods

2. **Synchronous File Operations** (`scripts/check-file-naming.ts:102-107`)
   - Uses `fs.readdirSync` and `fs.statSync` in loops
   - Blocks Node.js event loop during directory traversal
   - **Fix**: Use async `fs.promises` API throughout

### 🟢 LOW Priority Issues

1. **Hardcoded Test Paths** (`scripts/fix-test-imports.sh`)
   - Contains hardcoded file paths and sed commands
   - Brittle and requires manual updates for new tests
   - **Fix**: Generate dynamically or use AST-based approach

2. **Missing Error Handling** (`scripts/run-bun-tests.sh`)
   - No error handling for missing bun executable
   - No validation of passed arguments
   - **Fix**: Add existence checks and argument validation

## Running Tests

The following scripts are available to run tests:

```bash
# Run all tests
npm test

# Run all tests in watch mode
npm run test:watch

# Generate a test coverage report
npm run test:coverage

# Run tests in a CI environment
npm run test:ci

# Run only the high-level smoke tests
npm run test:smoke

# Run a specific test file
npm test -- __tests__/components/Header.test.tsx
```

## VSCode Integration

With the [Jest extension for VSCode](https://marketplace.visualstudio.com/items?itemName=Orta.vscode-jest), you can run and debug tests directly from your editor. The configuration should work automatically.

## Best Practices

1. Keep test configurations minimal and focused
2. Use environment-specific configs only when necessary
3. Maintain parity between Jest and Bun environments
4. Document custom matchers and utilities
5. Version lock test dependencies for consistency
6. Use npm scripts instead of direct test runner commands
7. Validate file naming conventions in CI pipeline
8. **Assign tests to their specific functionality** - Never use generic "testing" functionality names

## Troubleshooting

- **`ReferenceError: document is not defined`**: This can happen if the test environment is not correctly set to `jsdom`. The project's `jest.config.cjs` should handle this, but if you encounter it, ensure the test file is being correctly picked up by Jest.
- **Mocking Issues**: For complex cases, you might need manual mocks. Place these in a `__mocks__` directory adjacent to the module being mocked or in the top-level `__tests__/__mocks__/` directory.
