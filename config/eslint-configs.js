/**
 * MODULAR ESLINT CONFIGURATIONS
 * 
 * This file exports clean, organized ESLint configurations that can be 
 * composed together in the main eslint.config.ts file.
 */

import globals from 'globals';
import { patterns, ignores } from './tools.config.js';

// Base ignore patterns from master config
export const globalIgnores = {
  name: 'global/ignores',
  ignores: [
    ...ignores.deps,
    ...ignores.build,
    ...ignores.cache,
    'components/ui/code-block/prism-syntax-highlighting/prism.js',
    'config/.remarkrc.mjs',
    'config/',
  ],
};

// TypeScript project configuration
export const typescriptProject = {
  name: 'typescript/project-setup',
  languageOptions: {
    parserOptions: {
      project: ['./tsconfig.json'],
      tsconfigRootDir: `${import.meta.dirname}/..`,
    },
  },
};

// React and Next.js configuration
export const reactNextConfig = {
  name: 'react-next/setup',
  files: patterns.source,
  languageOptions: {
    globals: {
      ...globals.browser,
      ...globals.node,
      ...globals.es2021,
    },
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
  rules: {
    'react/prop-types': 'off',
    'react/react-in-jsx-scope': 'off',
    'react/no-unknown-property': ['error', { ignore: ['jsx', 'global'] }],
    'react/no-unescaped-entities': 'off',
  },
};

// TypeScript rules configuration
export const typescriptRules = {
  name: 'typescript/rules',
  rules: {
    '@typescript-eslint/naming-convention': [
      'warn',
      { selector: 'variable', format: ['camelCase', 'UPPER_CASE', 'PascalCase'] },
      { selector: 'function', format: ['camelCase', 'PascalCase'] },
      { selector: 'typeLike', format: ['PascalCase'] }
    ],
    // Type-checking rules set to warn instead of error
    '@typescript-eslint/no-unsafe-assignment': 'warn',
    '@typescript-eslint/no-unsafe-call': 'warn',
    '@typescript-eslint/no-unsafe-member-access': 'warn',
    '@typescript-eslint/no-unsafe-argument': 'warn',
    '@typescript-eslint/no-unsafe-return': 'warn',
    '@typescript-eslint/no-explicit-any': 'warn',
    // Code quality rules
    '@typescript-eslint/no-misused-promises': 'warn',
    '@typescript-eslint/no-require-imports': 'warn',
    '@typescript-eslint/no-base-to-string': 'warn',
    '@typescript-eslint/no-redundant-type-constituents': 'warn',
    '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
    '@typescript-eslint/restrict-template-expressions': 'warn',
    '@typescript-eslint/no-empty-object-type': 'warn',
    '@typescript-eslint/no-unused-vars': 'warn',
    '@typescript-eslint/no-unused-expressions': 'warn',
    'no-useless-escape': 'warn',
  },
};

// Server Components configuration
export const serverComponents = {
  name: 'next/server-components',
  files: ['**/*.server.{ts,tsx}'],
  rules: {
    'react-hooks/exhaustive-deps': 'off',
    'no-restricted-globals': [
      'error',
      { name: 'window', message: 'Cannot use window in Server Components' },
      { name: 'document', message: 'Cannot use document in Server Components' },
    ],
  },
};

// Client Components configuration  
export const clientComponents = {
  name: 'next/client-components',
  files: ['**/*.client.{ts,tsx}'],
  rules: {
    'react-hooks/exhaustive-deps': 'warn',
    'no-restricted-globals': 'off',
    '@typescript-eslint/no-misused-promises': 'off',
  },
};

// Configuration files overrides
export const configFiles = {
  name: 'config/files',
  files: [
    'eslint.config.ts',
    '*.config.ts',
    'jest.setup.ts',
    'next.config.ts',
    'tailwind.config.ts',
    'middleware.ts',
    'instrumentation.ts',
    'sentry.*.config.ts',
  ],
  languageOptions: {
    globals: {
      ...globals.node,
    },
  },
  rules: {
    'no-restricted-globals': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unnecessary-type-assertion': 'off',
    '@typescript-eslint/no-require-imports': 'off',
  },
};

// JavaScript config files (disable type checking)
export const jsConfigFiles = {
  name: 'config/js-files',
  files: [
    'eslint.config.js',
    '*.config.js',
    '*.config.mjs',
    '*.config.cjs',
    'postcss.config.cjs',
    'jest.setup.js',
    'next.config.js',
    'tailwind.config.js',
    'sentry.*.config.js'
  ],
  languageOptions: {
    globals: {
      ...globals.node,
    },
    parserOptions: {
      project: null,
    }
  },
  rules: {
    'no-restricted-globals': 'off',
    '@typescript-eslint/no-require-imports': 'off',
  },
};

// Test files configuration
export const testFiles = {
  name: 'testing/files',
  files: patterns.tests,
  rules: {
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    '@typescript-eslint/no-unsafe-argument': 'off',
  },
};

// MDX files configuration
export const mdxFiles = {
  name: 'mdx/files',
  files: patterns.markdown.filter(p => p.includes('mdx')),
  rules: {
    // Disable all TypeScript rules that require type information for MDX
    '@typescript-eslint/await-thenable': 'off',
    '@typescript-eslint/no-floating-promises': 'off',
    '@typescript-eslint/no-for-in-array': 'off',
    '@typescript-eslint/no-implied-eval': 'off',
    '@typescript-eslint/no-misused-promises': 'off',
    '@typescript-eslint/no-unnecessary-type-assertion': 'off',
    '@typescript-eslint/no-unsafe-argument': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    '@typescript-eslint/prefer-regexp-exec': 'off',
    '@typescript-eslint/require-await': 'off',
    '@typescript-eslint/restrict-plus-operands': 'off',
    '@typescript-eslint/restrict-template-expressions': 'off',
    '@typescript-eslint/unbound-method': 'off',
    // Allow specific MDX patterns
    'react/no-unescaped-entities': 'off',
    'react/no-unknown-property': 'off',
  },
}; 