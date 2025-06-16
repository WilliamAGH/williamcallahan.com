declare module "@eslint/js";
declare module "eslint-plugin-react/configs/recommended.js";
declare module "eslint-plugin-react/configs/jsx-runtime.js";
declare module "@next/eslint-plugin-next";

// For eslint-plugin-mdx, if the default import issue persists despite its docs
// asserting it should work, we can add a more specific type if known,
// or a general one for now.
// Assuming it should export an object with flatConfigs based on documentation:
interface MdxPlugin {
  flat: Record<string, unknown>; // Changed from any
  flatCodeBlocks: {
    // Flat config for code blocks within MDX
    rules?: Record<string, unknown>; // Changed from any
    [key: string]: unknown; // Changed from any & Allow other properties like languageOptions, plugins, etc.
  };
  createRemarkProcessor: (options?: {
    lintCodeBlocks?: boolean;
    languageMapper?: Record<string, string> | false;
  }) => unknown; // Changed from any & Processor factory, type of processor can be Linter.Processor
  // Add other exports if known (e.g., specific rules, parser itself if needed)
}

declare module "eslint-plugin-mdx" {
  // Declare that the module itself (when imported as a namespace)
  // has the MdxPlugin structure.
  const plugin: MdxPlugin;
  export = plugin; // For CommonJS modules that export an object directly
}
