/**
 * Babel Configuration
 * @description
 * Configuration for Babel transpilation in Next.js environment.
 *
 * IMPORTANT: This config is designed to work with Next.js features including:
 * - Font loading through next/font
 * - Server/Client components
 * - ESM module support
 *
 * @see {@link "https://nextjs.org/docs/messages/babel-font-loader-conflict"} - Next.js Font Loader
 * @see {@link "https://babeljs.io/docs/options"} - Babel Options
 */
module.exports = {
  presets: ["next/babel"],
  // Ensure ESM modules are processed correctly
  assumptions: {
    privateFieldsAsProperties: true,
    setPublicClassFields: true
  },
  // Process ESM in node_modules (important for pnpm)
  babelrcRoots: [".", "./node_modules"]
};
