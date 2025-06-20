/**
 * ESLint Configuration - Single Source of Truth
 * Cleaned up monolithic config with clear organization
 */

import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import jestPlugin from "eslint-plugin-jest";
import * as mdxPlugin from "eslint-plugin-mdx";
import reactHooks from "eslint-plugin-react-hooks";
import reactJsxRuntime from "eslint-plugin-react/configs/jsx-runtime.js";
import reactRecommended from "eslint-plugin-react/configs/recommended.js";
import globals from "globals";
import tseslint from "typescript-eslint";

const config = tseslint.config(
  // Global ignores
  {
    ignores: [
      "node_modules/",
      ".next/",
      ".husky/",
      "out/",
      "components/ui/code-block/prism-syntax-highlighting/prism.js",
      "config/.remarkrc.mjs",
      "config/",
    ],
  },

  // Base configurations
  js.configs.recommended,
  ...(tseslint.configs.recommendedTypeChecked as any),

  // TypeScript project setup
  {
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // React and Next.js configurations
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
      },
    },
    plugins: {
      react: reactRecommended.plugins?.react,
      "react-hooks": reactHooks,
      "@next/next": nextPlugin,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      ...reactRecommended.rules,
      ...reactJsxRuntime.rules,
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
      "react/no-unknown-property": ["error", { ignore: ["jsx", "global"] }],
      "react/jsx-no-target-blank": ["error", { allowReferrer: true }],
    },
  },

  // TypeScript rules
  {
    rules: {
      "@typescript-eslint/naming-convention": [
        "warn",
        { selector: "variable", format: ["camelCase", "UPPER_CASE", "PascalCase"] },
        { selector: "function", format: ["camelCase", "PascalCase"] },
        { selector: "typeLike", format: ["PascalCase"] },
      ],
      "no-restricted-globals": [
        "error",
        {
          name: "window",
          message: "Use only in client components (*.client.tsx) or with proper checks",
        },
        {
          name: "document",
          message: "Use only in client components (*.client.tsx) or with proper checks",
        },
      ],
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-misused-promises": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "@typescript-eslint/no-base-to-string": "warn",
      "@typescript-eslint/no-redundant-type-constituents": "warn",
      "@typescript-eslint/no-unnecessary-type-assertion": "warn",
      "@typescript-eslint/restrict-template-expressions": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-unused-expressions": "warn",
      "no-useless-escape": "warn",
    },
  },

  // Enforce centralized type definitions (all types must live in @/types or *.d.ts)
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["types/**/*", "**/*.d.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
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
      ],
    },
  },

  // Server Components
  {
    files: ["**/*.server.{ts,tsx}"],
    rules: {
      "react-hooks/exhaustive-deps": "off",
      "no-restricted-globals": [
        "error",
        { name: "window", message: "Cannot use window in Server Components" },
        { name: "document", message: "Cannot use document in Server Components" },
      ],
    },
  },

  // Client Components
  {
    files: ["**/*.client.{ts,tsx}"],
    rules: {
      "react-hooks/exhaustive-deps": "warn",
      "no-restricted-globals": "off",
      "@typescript-eslint/no-misused-promises": "off",
    },
  },

  // Configuration files - TypeScript
  {
    files: [
      "eslint.config.ts",
      "*.config.ts",
      "config/jest/*.ts",
      "config/**/*.ts",
      "next.config.ts",
      "tailwind.config.ts",
      "middleware.ts",
      "instrumentation.ts",
      "sentry.*.config.ts",
      "jest.config.ts",
      "scripts/**/*.ts",
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        project: null, // Disable type-aware linting for config files
      },
    },
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      "no-restricted-globals": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-require-imports": "off",
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
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        project: null,
      },
    },
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      "no-restricted-globals": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  },

  // Test files
  {
    files: ["**/__tests__/**/*.{ts,tsx,js,jsx}", "**/?(*.)+(spec|test).{js,jsx,ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
      parserOptions: {
        project: ["./__tests__/tsconfig.jest.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "no-restricted-globals": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-require-imports": "off",
      "no-restricted-syntax": "off",
    },
  },

  // Jest configuration
  {
    files: ["**/?(*.)+(jest.spec|jest.test).{js,jsx,ts,tsx}"],
    plugins: {
      jest: jestPlugin,
    },
    rules: {
      ...jestPlugin.configs.recommended.rules,
    },
    languageOptions: {
      globals: {
        ...globals.jest,
      },
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
      "no-restricted-globals": "off",
      "@typescript-eslint/naming-convention": "off",
    },
  },
  {
    files: ["public/scripts/plausible-init.js"],
    rules: {
      "no-restricted-globals": "off",
    },
  },
  {
    files: ["lib/blog/mdx.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
    },
  },

  // MDX configuration
  {
    name: "custom/mdx/recommended",
    files: ["**/*.mdx"],
    ...mdxPlugin.flat,
    processor: mdxPlugin.createRemarkProcessor({
      lintCodeBlocks: false,
      languageMapper: {},
    }) as any,
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      "react/no-unescaped-entities": "off",
      "react/no-unknown-property": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    name: "custom/mdx/code-blocks",
    files: ["**/*.mdx"],
    ...mdxPlugin.flatCodeBlocks,
    rules: {
      ...mdxPlugin.flatCodeBlocks.rules,
      ...tseslint.configs.disableTypeChecked.rules,
      "no-var": "error",
      "prefer-const": "error",
    },
  },
);

export default config;
