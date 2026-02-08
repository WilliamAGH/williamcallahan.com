import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const STATIC_IMAGE_MAPPING_REL_PATH = "./src/lib/data-access/static-image-mapping.json";

const EXEMPT_IMAGE_LITERAL_FILENAME_SUBSTRINGS = [
  "static-image-mapping.json",
  "static-images.ts",
  "placeholder-images.ts",
  "url-utils.ts",
  "og-image/route.ts",
  "migrate-static-images-to-s3.ts",
  "check-new-images.ts",
];

function isRecordOfStrings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  for (const entry of Object.values(value)) {
    if (typeof entry !== "string") return false;
  }
  return true;
}

function isExemptFile(filename) {
  return EXEMPT_IMAGE_LITERAL_FILENAME_SUBSTRINGS.some((pattern) => filename.includes(pattern));
}

function isInsideGetStaticImageUrl(node) {
  let current = node.parent;
  while (current) {
    if (current.type === "CallExpression") {
      const { callee } = current;
      if (
        (callee?.type === "Identifier" && callee.name === "getStaticImageUrl") ||
        (callee?.type === "MemberExpression" &&
          callee.property?.type === "Identifier" &&
          callee.property.name === "getStaticImageUrl")
      ) {
        return true;
      }
    }
    current = current.parent;
  }
  return false;
}

function isUsedAsStartsWithArgument(node) {
  const parent = node.parent;
  if (!parent || parent.type !== "CallExpression") return false;
  if (!Array.isArray(parent.arguments) || parent.arguments[0] !== node) return false;

  const { callee } = parent;
  if (!callee || callee.type !== "MemberExpression") return false;
  if (callee.computed) return false;
  if (callee.property?.type !== "Identifier") return false;

  return callee.property.name === "startsWith";
}

function isJsxAttributeValueLiteral(node) {
  const parent = node.parent;
  return parent?.type === "JSXAttribute" && parent.value === node;
}

function hasGetStaticImageUrlImport(context) {
  const program = context.sourceCode?.ast;
  if (!program || !Array.isArray(program.body)) return false;

  for (const node of program.body) {
    if (node.type !== "ImportDeclaration") continue;
    if (node.source?.value !== "@/lib/data-access/static-images") continue;

    for (const specifier of node.specifiers ?? []) {
      if (
        specifier.type === "ImportSpecifier" &&
        specifier.imported?.type === "Identifier" &&
        specifier.imported.name === "getStaticImageUrl"
      ) {
        return true;
      }
    }
  }
  return false;
}

function loadStaticMapping() {
  try {
    const resolved = resolve(process.cwd(), STATIC_IMAGE_MAPPING_REL_PATH);
    const raw = JSON.parse(readFileSync(resolved, "utf8"));
    if (!isRecordOfStrings(raw)) {
      console.warn("[oxlint/no-hardcoded-images] Static image mapping JSON has an invalid shape:", {
        resolved,
      });
      return null;
    }
    return raw;
  } catch (error) {
    console.warn("[oxlint/no-hardcoded-images] Failed to load static image mapping:", error);
    return null;
  }
}

const staticMapping = loadStaticMapping();

export default {
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
      create(context) {
        const hasImport = hasGetStaticImageUrlImport(context);
        const filename = String(context.filename ?? "");

        return {
          Literal(node) {
            const value = node?.value;
            if (typeof value !== "string") return;
            if (!value.startsWith("/images/")) return;
            if (isExemptFile(filename)) return;
            if (isInsideGetStaticImageUrl(node)) return;
            if (isUsedAsStartsWithArgument(node)) return;

            const imagePath = value;
            const isInS3 = staticMapping?.[imagePath];

            context.report({
              node,
              message: isInS3
                ? `Hardcoded image path "${imagePath}" detected. Use getStaticImageUrl("${imagePath}") to ensure S3/CDN delivery.`
                : `New image "${imagePath}" is not in the static image mapping. Add it to src/lib/data-access/static-image-mapping.json (and ensure the asset is uploaded to S3), then use getStaticImageUrl("${imagePath}").`,
              fix:
                isInS3 && hasImport
                  ? (fixer) => {
                      const text = context.sourceCode.getText(node);
                      if (isJsxAttributeValueLiteral(node)) {
                        return fixer.replaceText(node, `{getStaticImageUrl(${text})}`);
                      }
                      return fixer.replaceText(node, `getStaticImageUrl(${text})`);
                    }
                  : null,
            });
          },
        };
      },
    },
  },
};
