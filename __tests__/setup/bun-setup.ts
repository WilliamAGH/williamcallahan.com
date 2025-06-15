/**
 * @file __tests__/setup/bun-setup.ts
 * @description
 * This file serves as the dedicated setup entry point for tests run
 * with the Bun test runner. It registers the HappyDOM environment
 * and applies any necessary polyfills.
 *
 * It is preloaded via the `bun.test.preload` configuration in `package.json`.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";

try {
  // Register the global environment
  GlobalRegistrator.register();
  console.log("✅ HappyDOM environment registered successfully for Bun tests");
} catch (error) {
  console.error("❌ Failed to register HappyDOM environment for Bun tests:", error);
}

// Polyfill clipboard API for testing, as it's not available in HappyDOM
if (typeof navigator !== "undefined") {
  try {
    if (!navigator.clipboard) {
      Object.defineProperty(navigator, "clipboard", {
        value: {},
        writable: true,
        configurable: true,
      });
    }

    if (!navigator.clipboard.writeText) {
      Object.defineProperty(navigator.clipboard, "writeText", {
        value: async (_text: string) => Promise.resolve(),
        writable: true,
        configurable: true,
      });
    }
    console.log("✅ Clipboard API polyfill added for Bun tests");
  } catch (error) {
    console.error("❌ Failed to setup clipboard polyfill for Bun tests:", error);
  }
}
