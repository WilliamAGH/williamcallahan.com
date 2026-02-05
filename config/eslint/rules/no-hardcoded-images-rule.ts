import type { Rule } from "eslint";
import type * as ESTree from "estree";

const EXEMPT_IMAGE_LITERAL_FILENAME_SUBSTRINGS = [
  "static-image-mapping.json",
  "static-images.ts",
  "placeholder-images.ts",
  "url-utils.ts",
  "og-image/route.ts",
  "migrate-static-images-to-s3.ts",
  "check-new-images.ts",
] as const;

type StaticImageMapping = Record<string, string>;

function isRecordOfStrings(value: unknown): value is StaticImageMapping {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  for (const entry of Object.values(value as Record<string, unknown>)) {
    if (typeof entry !== "string") return false;
  }
  return true;
}

function isExemptFile(filename: string): boolean {
  return EXEMPT_IMAGE_LITERAL_FILENAME_SUBSTRINGS.some((pattern) => filename.includes(pattern));
}

type NodeWithParent = ESTree.Node & Rule.NodeParentExtension;

function isInsideGetStaticImageUrl(node: NodeWithParent): boolean {
  let current: NodeWithParent | null = node.parent;
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

function hasGetStaticImageUrlImport(context: Rule.RuleContext): boolean {
  const sourceCode = context.sourceCode;
  const program = sourceCode.ast;

  for (const node of program.body) {
    if (node.type !== "ImportDeclaration") continue;
    if (node.source.value !== "@/lib/data-access/static-images") continue;

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
  return false;
}

type CreateNoHardcodedImagesRuleOptions = {
  requireJson: NodeJS.Require;
  staticImageMappingRelPath: string;
};

function loadStaticMapping(options: CreateNoHardcodedImagesRuleOptions): StaticImageMapping | null {
  const { requireJson, staticImageMappingRelPath } = options;
  try {
    const resolved = requireJson.resolve(staticImageMappingRelPath);
    if (process.env.ESLINT_WATCH === "1") {
      delete requireJson.cache[resolved];
    }

    const rawMapping: unknown = requireJson(resolved);
    if (!isRecordOfStrings(rawMapping)) {
      console.warn("[eslint/no-hardcoded-images] Static image mapping JSON has an invalid shape:", {
        resolved,
      });
      return null;
    }
    return rawMapping;
  } catch (error) {
    console.warn("[eslint/no-hardcoded-images] Failed to load static image mapping:", error);
    return null;
  }
}

export function createNoHardcodedImagesRule(
  options: CreateNoHardcodedImagesRuleOptions,
): Rule.RuleModule {
  return {
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
      const staticMapping = loadStaticMapping(options);
      const hasImport = hasGetStaticImageUrlImport(context);

      return {
        Literal(node) {
          if (typeof node.value !== "string") return;
          if (!/^\/images\//.exec(node.value)) return;
          if (isExemptFile(context.filename)) return;
          if (isInsideGetStaticImageUrl(node)) return;

          const imagePath = node.value;
          const isInS3 = staticMapping?.[imagePath];

          context.report({
            node,
            message: isInS3
              ? `Hardcoded image path "${imagePath}" detected. Use getStaticImageUrl("${imagePath}") to ensure S3/CDN delivery.`
              : `New image "${imagePath}" is not in the static image mapping. Add it to src/lib/data-access/static-image-mapping.json (and ensure the asset is uploaded to S3), then use getStaticImageUrl("${imagePath}").`,
            fix:
              isInS3 && hasImport
                ? function (fixer: Rule.RuleFixer) {
                    const source = context.sourceCode;
                    const text = source.getText(node);
                    return fixer.replaceText(node, `getStaticImageUrl(${text})`);
                  }
                : null,
          });
        },
      };
    },
  };
}
