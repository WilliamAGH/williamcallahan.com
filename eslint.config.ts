/**
 * ESLint Configuration - Gutted for Oxlint Performance
 *
 * Most rules and plugins are now handled by Oxlint (50-100x faster).
 * ESLint is kept only for:
 * 1. Complex naming conventions (@typescript-eslint/naming-convention)
 * 2. Complex AST selectors (no-restricted-syntax) Oxlint doesn't support
 * 3. Non-JS files (Markdown, YAML, JSONC) if needed
 *
 * Type-aware parsing is DISABLED for performance. Oxlint handles type-aware rules.
 */

import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import oxlint from "eslint-plugin-oxlint";
const GLOBAL_IGNORES = [
  "node_modules/",
  ".next/",
  ".husky/",
  "out/",
  "src/components/ui/code-block/prism-syntax-highlighting/prism.js",
  "config/.remarkrc.mjs",
  "config/",
  "next-env.d.ts",
  "**/*.mdx", // Skip MDX files entirely - the parser doesn't handle JSX in lists correctly
];

const CODE_FILES = ["**/*.{js,jsx,ts,tsx}"];
const CODE_FILES_IGNORES = ["**/*.mdx", "**/*.d.ts", "scripts/**/*", "config/**/*"];

const config = defineConfig(
  // Global ignores
  {
    ignores: GLOBAL_IGNORES,
  },

  // Base configurations
  js.configs.recommended,
  // Include base TS config for parser + plugin (but NOT type-checked rules)
  ...tseslint.configs.recommended,

  // Main TypeScript/React config - NO TYPE-AWARE PARSING (biggest performance win)
  {
    files: CODE_FILES,
    ignores: CODE_FILES_IGNORES,
    languageOptions: {
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        // NO project: [...] - Type-aware parsing DISABLED for performance
        // Oxlint handles type-aware rules via --type-aware flag
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      // ============================================================
      // KEPT: Complex naming conventions Oxlint doesn't support
      // ============================================================
      "@typescript-eslint/naming-convention": [
        "warn",
        { selector: "variable", format: ["camelCase", "UPPER_CASE", "PascalCase"] },
        { selector: "function", format: ["camelCase", "PascalCase"] },
        { selector: "typeLike", format: ["PascalCase"] },
      ],
      // Oxlint covers most TS/JS rules; keep ESLint from enforcing require/import style.
      "@typescript-eslint/no-require-imports": "off",
      "no-underscore-dangle": [
        "error",
        {
          allow: ["__filename", "__dirname", "__TEST__"],
          allowAfterThis: false,
          allowAfterSuper: false,
          allowAfterThisConstructor: false,
          enforceInMethodNames: true,
          enforceInClassFields: true,
          allowInArrayDestructuring: false,
          allowInObjectDestructuring: false,
          allowFunctionParams: true,
        },
      ],

      // ============================================================
      // REMOVED: All rules now handled by Oxlint
      // - no-console, eqeqeq, no-unused-vars, prefer-const, etc.
      // - react/*, react-hooks/*, @next/next/*
      // - import/* (Oxlint handles import/cycle, import/order faster)
      // - All TypeScript strict rules (handled by Oxlint --type-aware)
      // ============================================================
    },
  },

  // Enforce centralized type definitions (all types AND Zod schemas must live in @/types or *.d.ts)
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["src/types/**/*", "**/*.d.ts", "**/*.mdx"],
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector: "TSTypeAliasDeclaration",
          message: "Type aliases must reside in @/types or declaration files (*.d.ts)",
        },
        {
          selector: "TSInterfaceDeclaration",
          message: "Interfaces must reside in @/types or declaration files (*.d.ts)",
        },
        {
          selector: "TSEnumDeclaration",
          message: "Enums must reside in @/types or declaration files (*.d.ts)",
        },
        {
          selector: "VariableDeclarator[init.type='CallExpression'][init.callee.object.name='z']",
          message:
            "Zod schemas must reside in @/types or declaration files (*.d.ts). Stop trying to cheat the type system!",
        },
        {
          selector:
            "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator[init.type='CallExpression'][init.callee.object.name='z']",
          message:
            "Exported Zod schemas must reside in @/types or declaration files (*.d.ts). No sneaky workarounds allowed!",
        },
        {
          selector: "ImportDeclaration[source.value='zod']",
          message:
            "Zod imports must only be in @/types or declaration files (*.d.ts). All schemas belong in the centralized type system!",
        },
      ],
    },
  },

  // Configuration files - TypeScript
  {
    files: [
      "eslint.config.ts",
      "*.config.ts",
      "config/**/*.ts",
      "next.config.ts",
      "tailwind.config.ts",
      "src/instrumentation*.ts",
      "sentry.*.config.ts",
      "scripts/**/*.ts",
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-underscore-dangle": "off",
      "@typescript-eslint/naming-convention": "off",
    },
  },

  // JavaScript config files
  {
    files: [
      "*.config.js",
      "*.config.mjs",
      "*.config.cjs",
      "postcss.config.cjs",
      "config/**/*.js",
      "config/tailwind.config.js",
      "config/tools.config.js",
      "scripts/**/*.js",
      "scripts/**/*.mjs",
      "scripts/**/*.cjs",
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {},
  },

  // Test file configuration (Vitest rules handled by Oxlint)
  {
    files: ["**/__tests__/**/*.{ts,tsx,js,jsx}", "**/?(*.)+(spec|test).{js,jsx,ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.vitest,
      },
    },
    rules: {
      "no-restricted-syntax": "off",
      "no-underscore-dangle": "off",
      "@typescript-eslint/naming-convention": "off",
    },
  },

  // Specific file exemptions
  {
    files: ["**/investment-card.client.tsx"],
    rules: {
      "@typescript-eslint/naming-convention": "off",
    },
  },
  {
    files: [
      "**/lib/hooks/use-isomorphic-layout-effect.ts",
      "**/lib/logo.ts",
      "**/lib/utils/ensure-server-only.ts",
      "**/lib/utils/runtime-guards.ts",
      "**/lib/context/GlobalWindowRegistryContext.client.tsx",
    ],
    rules: {
      "@typescript-eslint/naming-convention": "off",
    },
  },
  {
    files: ["public/scripts/plausible-init.js"],
    rules: {},
  },

  // Project-specific global type uniqueness is enforced by `bun scripts/check-duplicate-types.ts`
  // (deterministic build-time check, not an ESLint rule — see scripts/check-duplicate-types.ts)

  // Disable overlapping ESLint rules with Oxlint to avoid duplicate diagnostics
  // Derive the rule-disable list from the same .oxlintrc.json Oxlint uses, to avoid drift.
  // This should remain last in the config array (per eslint-plugin-oxlint docs).
  ...oxlint.buildFromOxlintConfigFile("./.oxlintrc.json"),
);

export default config;
