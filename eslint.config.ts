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
// Local ESLint Rule Types
import type { Rule } from "eslint";

/**
 * ESLint rule to disallow duplicate TypeScript type definitions (type aliases, interfaces, enums)
 * anywhere in the repository. Types must already live under `types/` or declaration files as
 * enforced by the existing `no-restricted-syntax` rule – this rule focuses solely on *uniqueness*.
 *
 * KNOWN LIMITATION: This rule uses a module-level Map that persists across lint runs,
 * which can cause false positives in watch mode or when files are renamed/deleted.
 * This is a fundamental limitation of ESLint's architecture for cross-file validation.
 * For production use, consider:
 * 1. TypeScript's built-in duplicate identifier detection
 * 2. A dedicated build-time script using ts-morph or similar
 * 3. Running this rule only in CI/CD, not in watch mode
 */
const noDuplicateTypesRule: Rule.RuleModule & { duplicateTypeTracker?: Map<string, string> } = {
  meta: {
    type: "problem",
    docs: {
      description: "disallow duplicated type, interface or enum names in the codebase",
      url: "https://eslint.org/docs/latest/extend/custom-rules",
    },
    schema: [], // no options
  },
  create(context) {
    // Lazily initialize the shared tracker without using assignment inside an expression
    const duplicateTypeTracker: Map<string, string> =
      noDuplicateTypesRule.duplicateTypeTracker ?? new Map<string, string>();

    // Store it on the rule for future files
    if (!noDuplicateTypesRule.duplicateTypeTracker) {
      noDuplicateTypesRule.duplicateTypeTracker = duplicateTypeTracker;
    }

    /** Records the location of first declaration and reports on duplicates */
    const record = (idNode: any) => {
      const name: string = idNode.name;
      const currentLocation = `${context.getFilename()}:${idNode.loc.start.line}`;

      // Ignore .d.ts files from node_modules to avoid false positives on @types packages
      if (context.getFilename().includes("node_modules")) return;

      if (duplicateTypeTracker.has(name)) {
        // Already seen elsewhere – report duplicate
        const firstSeen = duplicateTypeTracker.get(name);
        if (firstSeen && firstSeen !== currentLocation) {
          context.report({
            node: idNode,
            message: `Type "${name}" is already declared at ${firstSeen}. All type names must be globally unique.`,
          });
        }
      } else {
        duplicateTypeTracker.set(name, currentLocation);
      }
    };

    return {
      TSTypeAliasDeclaration(node: any) {
        record(node.id);
      },
      TSInterfaceDeclaration(node: any) {
        record(node.id);
      },
      TSEnumDeclaration(node: any) {
        record(node.id);
      },
    };
  },
};

const config = tseslint.config(
  // Global ignores
  {
    ignores: [
      "node_modules/",
      ".next/",
      ".husky/",
      "out/",
      ".jest-pre-compiled/",
      "components/ui/code-block/prism-syntax-highlighting/prism.js",
      "config/.remarkrc.mjs",
      "config/",
      "next-env.d.ts",
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
        ecmaVersion: "latest",
        sourceType: "module",
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
      "no-underscore-dangle": [
        "error",
        {
          allow: ["__filename", "__dirname", "__TEST__"],
          enforceInMethodNames: true,
          enforceInClassFields: true,
          allowInArrayDestructuring: false,
          allowInObjectDestructuring: false,
          allowFunctionParams: false,
        },
      ],
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
      // Custom rule configuration to prevent auto-fixing unused vars with underscores
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          vars: "all",
          args: "none", // Change from "after-used" to "none" to prevent auto-fixing function parameters
          ignoreRestSiblings: true,
          // Override default `^_` to disallow using underscore for unused variables.
          // The project convention is to use `void var;` for intentional fall-through.
          varsIgnorePattern: "^$", // This will only match an empty string, effectively disabling the ignore pattern.
          argsIgnorePattern: "^$",
          // Allow destructuring with unused parameters without requiring underscore prefix
          destructuredArrayIgnorePattern: "^$",
        },
      ],
      "no-useless-escape": "warn",
    },
  },

  // Enforce centralized type definitions (all types AND Zod schemas must live in @/types or *.d.ts)
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
      "no-underscore-dangle": "off", // Allow underscores in config and script files
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
        project: ["./__tests__/tsconfig.json"],
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
      "no-underscore-dangle": "off", // Allow underscores in test files for mocking and test utilities
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

  // --------------------------------------------------
  // Project-specific global type uniqueness rule
  // --------------------------------------------------
  {
    plugins: {
      project: {
        rules: {
          "no-duplicate-types": noDuplicateTypesRule,
        },
      },
    },
    rules: {
      "project/no-duplicate-types": "error",
    },
  },

  // --------------------------------------------------
  // Prevent hardcoded /images/ paths - enforce S3/CDN usage
  // --------------------------------------------------
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    ignores: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}", "scripts/**/*", "config/**/*"],
    plugins: {
      s3: {
        rules: {
          "no-hardcoded-images": {
            meta: {
              type: "problem",
              docs: {
                description: "Disallow hardcoded /images/ paths - use getStaticImageUrl() for S3/CDN delivery",
              },
              fixable: "code",
              schema: [],
            },
            create(context: any) {
              // Import the static mapping at the top of the file
              let staticMapping: Record<string, string> | null = null;
              try {
                // Use require to load the JSON file synchronously
                staticMapping = require("./lib/data-access/static-image-mapping.json");
              } catch {
                // If we can't load the mapping, we'll still report errors but can't check if images exist
              }

              /**
               * Walk up the AST from the current node to see if it appears
               * anywhere inside a getStaticImageUrl(...) call.
               */
              function isInsideGetStaticImageUrl(node: any): boolean {
                let current = node.parent;
                while (current) {
                  if (current.type === "CallExpression") {
                    const { callee } = current;
                    if (
                      (callee.type === "Identifier" && callee.name === "getStaticImageUrl") ||
                      // Handle potential namespace import (e.g. utils.getStaticImageUrl)
                      (callee.type === "MemberExpression" &&
                        callee.property.type === "Identifier" &&
                        callee.property.name === "getStaticImageUrl")
                    ) {
                      return true;
                    }
                  }
                  current = current.parent;
                }
                return false;
              }

              /**
               * Check if the file already imports getStaticImageUrl
               */
              function hasGetStaticImageUrlImport(): boolean {
                const sourceCode = context.getSourceCode();
                const program = sourceCode.ast;

                for (const node of program.body) {
                  if (node.type === "ImportDeclaration") {
                    if (node.source.value === "@/lib/data-access/static-images") {
                      for (const specifier of node.specifiers) {
                        if (specifier.type === "ImportSpecifier" && specifier.imported.name === "getStaticImageUrl") {
                          return true;
                        }
                      }
                    }
                  }
                }
                return false;
              }

              return {
                Literal(node: any) {
                  if (
                    typeof node.value === "string" &&
                    node.value.match(/^\/images\//) &&
                    !context.getFilename().includes("static-image-mapping.json") &&
                    !context.getFilename().includes("static-images.ts") &&
                    !context.getFilename().includes("placeholder-images.ts") &&
                    !context.getFilename().includes("url-utils.ts") &&
                    !context.getFilename().includes("og-image/route.ts") &&
                    !context.getFilename().includes("migrate-static-images-to-s3.ts") &&
                    !context.getFilename().includes("check-new-images.ts")
                  ) {
                    // Skip if the string literal ultimately lives inside a getStaticImageUrl(...) call
                    if (isInsideGetStaticImageUrl(node)) {
                      return;
                    }

                    const imagePath = node.value;
                    const isInS3 = staticMapping?.[imagePath];
                    const hasImport = hasGetStaticImageUrlImport();

                    context.report({
                      node,
                      message: isInS3
                        ? `Hardcoded image path "${imagePath}" detected. Use getStaticImageUrl("${imagePath}") to ensure S3/CDN delivery.`
                        : `New image "${imagePath}" is not in S3. Run 'bun run migrate-static-images:upload' to migrate it, then use getStaticImageUrl("${imagePath}").`,
                      fix:
                        isInS3 && hasImport
                          ? function (fixer: any) {
                              // Simple fix: wrap the string in getStaticImageUrl()
                              return fixer.replaceText(node, `getStaticImageUrl(${node.raw})`);
                            }
                          : null,
                    });
                  }
                },
              };
            },
          },
        },
      },
    },
    rules: {
      "s3/no-hardcoded-images": "error", // Changed from "warn" to "error" to fail builds
    },
  },
);

export default config;
