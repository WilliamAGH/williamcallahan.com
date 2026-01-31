/**
 * ESLint Configuration - Gutted for Oxlint Performance
 *
 * Most rules and plugins are now handled by Oxlint (50-100x faster).
 * ESLint is kept only for:
 * 1. Complex naming conventions (@typescript-eslint/naming-convention)
 * 2. Complex AST selectors (no-restricted-syntax) Oxlint doesn't support
 * 3. Custom project-specific rules (no-duplicate-types, no-hardcoded-images)
 * 4. Non-JS files (Markdown, YAML, JSONC) if needed
 *
 * Type-aware parsing is DISABLED for performance. Oxlint handles type-aware rules.
 */

import { createRequire } from "node:module";
import js from "@eslint/js";
import jestPlugin from "eslint-plugin-jest";
import globals from "globals";
import tseslint from "typescript-eslint";
import oxlint from "eslint-plugin-oxlint";

// ESM-compatible require for loading JSON files
const requireJson = createRequire(import.meta.url);
// Single source of truth for the static image mapping JSON path
const STATIC_IMAGE_MAPPING_REL_PATH = "./src/lib/data-access/static-image-mapping.json" as const;
// Local ESLint Rule Types
import type { Rule } from "eslint";
import type { TSESTree } from "@typescript-eslint/utils";

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
    const record = (idNode: TSESTree.Identifier) => {
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
      TSTypeAliasDeclaration(node: TSESTree.TSTypeAliasDeclaration) {
        record(node.id);
      },
      TSInterfaceDeclaration(node: TSESTree.TSInterfaceDeclaration) {
        record(node.id);
      },
      TSEnumDeclaration(node: TSESTree.TSEnumDeclaration) {
        record(node.id);
      },
    };
  },
};

/**
 * Returns true if the given AST node is nested within a getStaticImageUrl(...) call.
 * Hoisted to module scope to satisfy consistent-function-scoping and avoid recreating on each invocation.
 */
function isInsideGetStaticImageUrl(node: TSESTree.Node): boolean {
  let current: TSESTree.Node | undefined = node.parent;
  while (current) {
    if (current.type === "CallExpression") {
      const { callee } = current;
      if (
        (callee.type === "Identifier" && callee.name === "getStaticImageUrl") ||
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

const config = tseslint.config(
  // Global ignores
  {
    ignores: [
      "node_modules/",
      ".next/",
      ".husky/",
      "out/",
      ".jest-pre-compiled/",
      "src/components/ui/code-block/prism-syntax-highlighting/prism.js",
      "config/.remarkrc.mjs",
      "config/",
      "config/jest/polyfills.js", // Jest timer compatibility - intentionally extends Number.prototype for Undici
      "next-env.d.ts",
      "**/*.mdx", // Skip MDX files entirely - the parser doesn't handle JSX in lists correctly
    ],
  },

  // Base configurations
  js.configs.recommended,
  // Include base TS config for parser + plugin (but NOT type-checked rules)
  ...tseslint.configs.recommended,

  // Main TypeScript/React config - NO TYPE-AWARE PARSING (biggest performance win)
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    ignores: ["**/*.mdx", "**/*.d.ts", "scripts/**/*", "config/**/*"],
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

  // Server Components
  {
    files: ["**/*.server.{ts,tsx}"],
    rules: {
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
      "no-restricted-globals": "off",
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
      "src/instrumentation*.ts",
      "sentry.*.config.ts",
      "jest.config.ts",
      "scripts/**/*.ts",
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-restricted-globals": "off",
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
    rules: {
      "no-restricted-globals": "off",
    },
  },

  // Test files
  {
    files: ["**/__tests__/**/*.{ts,tsx,js,jsx}", "**/?(*.)+(spec|test).{js,jsx,ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
    rules: {
      "no-restricted-globals": "off",
      "no-restricted-syntax": "off",
      "no-underscore-dangle": "off",
      "@typescript-eslint/naming-convention": "off",
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
      "project/no-duplicate-types": "warn", // Changed to warn for gradual migration
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
                description:
                  "Disallow hardcoded /images/ paths - use getStaticImageUrl() for S3/CDN delivery",
              },
              fixable: "code",
              schema: [],
            },
            create(context: Rule.RuleContext) {
              // Import the static mapping at the top of the file
              let staticMapping: Record<string, string> | null = null;
              try {
                // Use ESM-compatible require to load the JSON file synchronously.
                // Optional: bust require cache in watch mode to pick up changes without restart.
                const mappingRelPath = STATIC_IMAGE_MAPPING_REL_PATH;
                const resolved = requireJson.resolve(mappingRelPath);
                if (process.env.ESLINT_WATCH === "1" && (requireJson as any).cache) {
                  delete (requireJson as any).cache[resolved as unknown as string];
                }
                staticMapping = requireJson(resolved);
              } catch (error) {
                console.warn(
                  "[eslint/no-hardcoded-images] Failed to load static image mapping:",
                  error,
                );
              }

              // Use module-scoped helper to satisfy consistent-function-scoping

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
                        if (
                          specifier.type === "ImportSpecifier" &&
                          specifier.imported.type === "Identifier" &&
                          specifier.imported.name === "getStaticImageUrl"
                        ) {
                          return true;
                        }
                      }
                    }
                  }
                }
                return false;
              }

              return {
                Literal(node: TSESTree.Literal) {
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
                    if (isInsideGetStaticImageUrl(node as unknown as TSESTree.Node)) {
                      return;
                    }

                    const imagePath = node.value;
                    const isInS3 = staticMapping?.[imagePath];
                    const hasImport = hasGetStaticImageUrlImport();

                    context.report({
                      node,
                      message: isInS3
                        ? `Hardcoded image path "${imagePath}" detected. Use getStaticImageUrl("${imagePath}") to ensure S3/CDN delivery.`
                        : `New image "${imagePath}" is not in the static image mapping. Add it to src/lib/data-access/static-image-mapping.json (and ensure the asset is uploaded to S3), then use getStaticImageUrl("${imagePath}").`,
                      fix:
                        isInS3 && hasImport
                          ? function (fixer: Rule.RuleFixer) {
                              // Safer replacement that works across parsers
                              const source = context.getSourceCode();
                              const text = source.getText(node); // includes original quotes
                              return fixer.replaceText(node, `getStaticImageUrl(${text})`);
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
      "s3/no-hardcoded-images": "warn", // Changed to warn for gradual migration
    },
  },

  // Disable overlapping ESLint rules with Oxlint to avoid duplicate diagnostics
  ...oxlint.configs["flat/all"],
  ...oxlint.configs["flat/typescript"],
  ...oxlint.configs["flat/react"],
  ...oxlint.configs["flat/nextjs"],
);

export default config;
