    // eslint.config.ts - Using TypeScript and ESM syntax
import globals from "globals";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactRecommended from "eslint-plugin-react/configs/recommended.js";
import reactJsxRuntime from "eslint-plugin-react/configs/jsx-runtime.js";
import reactHooks from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";

// const mdxPlugin = mdxNamespace.default; // Previous attempt
// Now using mdxPlugin (the namespace import) directly

// Define the configuration array using tseslint.config helper
const config = tseslint.config(
  // Global ignores
  {
    ignores: [
      "node_modules/",
      ".next/",
      ".husky/", // Assuming husky setup files shouldn't be linted
      "out/", // If using static export
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
        // tsconfigRootDir: import.meta.dirname,
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
      "@typescript-eslint/no-unused-vars": "warn", // Unused variables don't break functionality
      "@typescript-eslint/no-unused-expressions": "warn", // Unused expressions are often false positives
      "no-useless-escape": "warn" // Unnecessary escapes don't affect runtime behavior
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
    files: ["**/prism-syntax-highlighting/prism.js"],
    rules: {
      "no-restricted-globals": "off",
      "@typescript-eslint/naming-convention": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
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
  { // Exemptions for config files
    files: [
      "eslint.config.js", // Keep .js for CJS compatibility if needed elsewhere
      "eslint.config.ts", // Add the TS config file itself
      "*.config.{js,ts,mjs,cjs}",
      "jest.setup.{js,ts}",
      "next.config.*",
      "postcss.config.*",
      "tailwind.config.*",
      "middleware.ts",
      "instrumentation.ts",
      "sentry.*.config.*",
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-restricted-globals": "off",
      // "@typescript-eslint/naming-convention": "off", // Keep if needed
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off"
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
);

export default config; // Export the config array
