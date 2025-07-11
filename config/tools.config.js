/**
 * CONSOLIDATED TOOL CONFIGURATION
 *
 * Master configuration file that consolidates settings for multiple tools.
 * This reduces config file proliferation and provides a single source of truth.
 */

const PROJECT_GLOBALS = {
  // Build environments
  NODE_ENV: process.env.NODE_ENV || "development",
  IS_PRODUCTION: process.env.NODE_ENV === "production",
  TARGET_ES: "es2022",
};

export const masterConfig = {
  // Project metadata
  project: {
    name: "william-callahan-dot-com",
    target: PROJECT_GLOBALS.TARGET_ES,
    environment: PROJECT_GLOBALS.NODE_ENV,
  },

  // Browserslist configuration
  browserslist: ["> 1%", "last 2 versions", "not ie <= 8"],

  // Build configuration shared across tools
  build: {
    target: PROJECT_GLOBALS.TARGET_ES,
    sourcemap: !PROJECT_GLOBALS.IS_PRODUCTION,
    minify: PROJECT_GLOBALS.IS_PRODUCTION,
  },

  // Shared file patterns for tools
  patterns: {
    source: ["**/*.{js,jsx,ts,tsx}"],
    tests: ["**/?(*.)+(spec|test).{js,jsx,ts,tsx}"],
    configs: ["**/*.config.{js,ts,mjs,cjs}"],
    markdown: ["**/*.{md,mdx}"],
    styles: ["**/*.{css,scss,sass}"],
  },

  // Common ignore patterns
  ignores: {
    build: [".next/**", "out/**", "dist/**"],
    deps: ["node_modules/**"],
    cache: [".cache/**", "*.tsbuildinfo"],
    logs: ["*.log", "logs/**"],
    temp: [".tmp/**", ".temp/**"],
  },
};

// Export individual configs for tools that need them
export const { browserslist, build, patterns, ignores } = masterConfig;

// Default export for tools that import the whole config
export default masterConfig;
