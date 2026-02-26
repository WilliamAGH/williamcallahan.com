/**
 * @file happydom.ts
 * @description
 * This file is used to register the HappyDOM environment for testing.
 * It provides browser-like globals (DOM, clipboard) needed by component tests.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";

try {
  // Register the global environment
  GlobalRegistrator.register();
  console.log("✅ HappyDOM environment registered successfully");
} catch (error) {
  console.error("❌ Failed to register HappyDOM environment:", error);
}

// Polyfill clipboard API for testing
if (typeof navigator !== "undefined") {
  try {
    if (!navigator.clipboard) {
      Object.defineProperty(navigator, "clipboard", {
        value: {},
        writable: true,
        configurable: true,
      });
    }

    // Add writeText method if it doesn't exist
    if (!navigator.clipboard.writeText) {
      Object.defineProperty(navigator.clipboard, "writeText", {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        value: async (_text: string) => Promise.resolve(),
        writable: true,
        configurable: true,
      });
    }

    console.log("✅ Clipboard API polyfill added");
  } catch (error) {
    console.error("❌ Failed to setup clipboard polyfill:", error);
  }
}
