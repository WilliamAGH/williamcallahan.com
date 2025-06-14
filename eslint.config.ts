/* eslint-disable @typescript-eslint/no-unsafe-argument */
// eslint.config.ts - Using TypeScript and ESM syntax
import globals from "globals";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactRecommended from "eslint-plugin-react/configs/recommended.js";
import reactJsxRuntime from "eslint-plugin-react/configs/jsx-runtime.js";
import reactHooks from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";
import jestPlugin from "eslint-plugin-jest";
import * as mdxPlugin from "eslint-plugin-mdx";

// Define the configuration array using tseslint.config helper
const config = tseslint.config(
  // Global ignores
  {
    ignores: [
      "node_modules/",
      ".next/",
      ".husky/", // Assuming husky setup files shouldn't be linted
      "out/", // If using static export
      "__tests__/", // Ignore test files; use bun test and jest for tests
      "components/ui/code-block/prism-syntax-highlighting/prism.js", // Third-party minified library
      "config/.remarkrc.mjs", // Remark-lint configuration file
      "config/", // Config directory
      // Add other global ignores if needed
    ],
  },

  // Base JS recommended rules
  js.configs.recommended as any,

  // TypeScript configuration - Using recommendedTypeChecked
  // This applies to .ts, .tsx, .mts, .cts files by default
  ...(tseslint.configs.recommendedTypeChecked as any),
  // We need to explicitly provide project information for the above
  {
    languageOptions: {
      parserOptions: {
        // Explicitly reference the tsconfig.json file instead of using project: true
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // React specific configurations
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    // Spread recommended React settings
    // Note: reactRecommended might need adjustment for flat config structure
    languageOptions: {
      ...((reactRecommended as any).languageOptions || {}), // Merge languageOptions if present
      globals: {
        ...globals.browser,
        ...globals.node, // Add node globals if needed in some React files
        ...globals.es2021, // Or appropriate ES version
      },
    },
    plugins: {
      ...((reactRecommended as any).plugins || {}), // Merge plugins if present
    },
    settings: {
      react: {
        version: "detect", // Automatically detect the React version
      },
      ...((reactRecommended as any).settings || {}), // Merge settings
    },
    rules: {
      ...((reactRecommended as any).rules || {}),
      ...((reactJsxRuntime as any).rules || {}), // Apply JSX runtime rules
      "react/prop-types": "off", // Often off in TS projects
      "react/react-in-jsx-scope": "off", // Handled by new JSX transform
      "react/no-unknown-property": ["error", { ignore: ["jsx", "global"] }],
      "react/jsx-no-target-blank": "off",
    },
  } as any, // Cast the entire React config object to any

  // React Hooks plugin configuration
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: (reactHooks.configs.recommended as any).rules, // Cast rules to any
  } as any, // Cast the entire React Hooks config object to any

  // Next.js plugin configuration
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: {
      "@next/next": nextPlugin,
    },
    rules: {
      ...((nextPlugin.configs.recommended as any).rules || {}),
      ...((nextPlugin.configs["core-web-vitals"] as any).rules || {}),
    },
  } as any, // Cast the entire Next.js config object to any

  // Project-specific rules (applied globally unless overridden)
  {
    rules: {
      "@typescript-eslint/naming-convention": [
        "warn",
        { "selector": "variable", "format": ["camelCase", "UPPER_CASE", "PascalCase"] },
        { "selector": "function", "format": ["camelCase", "PascalCase"] },
        { "selector": "typeLike", "format": ["PascalCase"] }
      ],
      "no-restricted-globals": [
        "error",
        { "name": "window", "message": "Use only in client components (*.client.tsx) or with proper checks" },
        { "name": "document", "message": "Use only in client components (*.client.tsx) or with proper checks" }
      ],
      // Type-checking rules set to warn instead of completely disabled
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      // Code quality rules set to warn
      "@typescript-eslint/no-misused-promises": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "@typescript-eslint/no-base-to-string": "warn",
      "@typescript-eslint/no-redundant-type-constituents": "warn",
      "@typescript-eslint/no-unnecessary-type-assertion": "warn",
      "@typescript-eslint/restrict-template-expressions": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
      // Code cleanliness
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-unused-expressions": "warn",
      "no-useless-escape": "warn"
    },
  },

  // Overrides (Translate from old overrides)
  // Server Components Override
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

  // Client Components Override
  {
    files: ["**/*.client.{ts,tsx}"],
    rules: {
      "react-hooks/exhaustive-deps": "warn",
      "no-restricted-globals": "off",
      "@typescript-eslint/no-misused-promises": "off",
    },
  },

  // Specific File Exemptions
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
      "**/lib/context/GlobalWindowRegistryContext.client.tsx"
    ],
    rules: {
      "no-restricted-globals": "off",
      "@typescript-eslint/naming-convention": "off",
    },
  },
  { // Allow browser globals in plausible init script
    files: ["public/scripts/plausible-init.js"],
    rules: {
      "no-restricted-globals": "off",
    },
  },
{ // Exemptions for TypeScript config files - ensure they use project-based linting
    files: [
      "eslint.config.ts",
      "*.config.ts",
      "jest.setup.ts",
      "next.config.ts", // if you use next.config.ts
      "tailwind.config.ts", // if you use tailwind.config.ts
      "middleware.ts",
      "instrumentation.ts",
      "sentry.*.config.ts", // if you use Sentry TS configs
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      // IMPORTANT: No parserOptions.project = null here, so it uses the global TS config
    },
    rules: {
      "no-restricted-globals": "off",
      // "@typescript-eslint/naming-convention": "off", // Keep if needed
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-require-imports": "off",
    }
  },
  { // Exemptions for config files
    files: [
      "eslint.config.js",         // JavaScript eslint config (if any)
      "*.config.js",              // General JS configs
      "*.config.mjs",             // General MJS configs
      "*.config.cjs",             // General CJS configs
      "postcss.config.cjs",       // Explicitly include postcss.config.cjs
      "jest.setup.js",            // JavaScript Jest setup
      "next.config.js",           // JavaScript Next.js config
      "tailwind.config.js",       // JavaScript Tailwind config
      "sentry.*.config.js"        // JavaScript Sentry configs
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        project: null, // Disable project-based linting for these config files
      }
    },
    rules: {
      // Spread rules from disableTypeChecked to turn off all type-aware linting for these JS files
      ...(tseslint.configs.disableTypeChecked as any).rules,
      // Keep existing specific overrides for JS config files
      "no-restricted-globals": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unsafe-assignment": "off", // May be redundant with disableTypeChecked but safe to keep
      "@typescript-eslint/no-unsafe-call": "off",      // May be redundant
      "@typescript-eslint/no-unsafe-member-access": "off", // May be redundant
      "@typescript-eslint/no-unsafe-return": "off",    // May be redundant
      "@typescript-eslint/no-explicit-any": "off",       // May be redundant
      "@typescript-eslint/no-unnecessary-type-assertion": "off" // May be redundant
    }
  },
  {
    files: ["**/__tests__/**/*.{ts,tsx}", "**/?(*.)+(spec|test).{js,jsx,ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off"
    }
  } as any, // Disable TS strict rules in test files

  // Jest specific configuration
  {
    // Apply Jest plugin rules only to files matching the pattern
    files: ["**/?(*.)+(jest.spec|jest.test).{js,jsx,ts,tsx}"],
    plugins: {
      jest: jestPlugin,
    },
    rules: {
      // Use recommended Jest rules
      ...(jestPlugin.configs.recommended as any).rules,
      // Add any Jest-specific overrides here if needed
    },
    languageOptions: {
      globals: {
        ...globals.jest, // Add Jest globals
      },
    },
  },
  { // Disable no-unsafe-assignment for MDX processing file
    files: ["lib/blog/mdx.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
    },
  },

  // MDX Configuration
  // Based on https://github.com/mdx-js/eslint-mdx/blob/main/README.md#flat-config
  {
    name: "custom/mdx/recommended",
    files: ["**/*.mdx"],
    ...mdxPlugin.flat,
    processor: mdxPlugin.createRemarkProcessor({
      // Disable linting code blocks for performance
      // Enable if you want to lint code blocks: lintCodeBlocks: true
      lintCodeBlocks: false,
      languageMapper: {},
    }) as any,
    rules: {
      // Disable all TypeScript rules that require type information for MDX
      ...tseslint.configs.disableTypeChecked.rules,
      // Allow specific MDX patterns
      "react/no-unescaped-entities": "off",
      "react/no-unknown-property": "off",
      // Disable unused vars warning for MDX files since components are used in JSX content
      "@typescript-eslint/no-unused-vars": "off",
    },
  } as any,
  {
    name: "custom/mdx/code-blocks", 
    files: ["**/*.mdx"],
    ...mdxPlugin.flatCodeBlocks,
    rules: {
      ...mdxPlugin.flatCodeBlocks.rules,
      // Disable all TypeScript rules that require type information for MDX code blocks
      ...tseslint.configs.disableTypeChecked.rules,
      // Add basic code quality rules for code blocks
      "no-var": "error",
      "prefer-const": "error",
    },
  } as any,
);

export default config; // Export the config array
