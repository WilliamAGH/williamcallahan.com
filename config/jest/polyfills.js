// Jest polyfills for missing web APIs

import { TextDecoder, TextEncoder } from "node:util";

// TextEncoder/TextDecoder polyfill for Node.js environment
if (typeof globalThis.TextEncoder === "undefined") {
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
}

// Global fetch is handled by Jest environment setup
// Note: We don't polyfill fetch here to avoid ES module import issues
