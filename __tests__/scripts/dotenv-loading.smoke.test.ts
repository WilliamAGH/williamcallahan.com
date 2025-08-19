/**
 * Smoke test for dotenv v17 compatibility
 * Ensures scripts use consistent dotenv initialization pattern
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Dotenv v17 Compatibility Test", () => {
  it("should use consistent dotenv import pattern across all scripts", () => {
    const scriptsToCheck = ["scripts/submit-sitemap.ts"];

    const results: Record<string, string> = {};

    for (const script of scriptsToCheck) {
      const content = readFileSync(join(process.cwd(), script), "utf-8");

      // Check for different dotenv patterns
      if (content.includes('import "dotenv/config"')) {
        results[script] = "import dotenv/config";
      } else if (content.includes("dotenv.config()")) {
        results[script] = "dotenv.config()";
      } else if (content.includes("loadEnvironmentWithMultilineSupport")) {
        results[script] = "custom env loader";
      } else {
        results[script] = "no dotenv";
      }
    }

    // Submit-sitemap should use custom env loader
    expect(results["scripts/submit-sitemap.ts"]).toBe("custom env loader");
  });
});
