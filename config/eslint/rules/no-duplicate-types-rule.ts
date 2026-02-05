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
const duplicateTypeTracker = new Map<string, string>();

export const noDuplicateTypesRule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "disallow duplicated type, interface or enum names in the codebase",
      url: "https://eslint.org/docs/latest/extend/custom-rules",
    },
    schema: [], // no options
  },
  create(context) {
    /** Records the location of first declaration and reports on duplicates */
    const record = (idNode: TSESTree.Identifier) => {
      const name: string = idNode.name;
      const currentLocation = `${context.filename}:${idNode.loc.start.line}`;

      // Ignore .d.ts files from node_modules to avoid false positives on @types packages
      if (context.filename.includes("node_modules")) return;

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
