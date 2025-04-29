const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './'
});

const customJestConfig = {
  setupFilesAfterEnv: [
    '<rootDir>/__tests__/lib/setup/jest.setup.ts'
  ],
  moduleDirectories: ['node_modules', '<rootDir>'],
  testEnvironment: 'jest-environment-jsdom',
  coverageThreshold: {
    global: {
      statements: 65,
      branches: 55,
      functions: 65,
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
