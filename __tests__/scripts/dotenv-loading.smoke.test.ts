/**
 * Smoke test for dotenv v17 compatibility
 * Ensures scripts use consistent dotenv initialization pattern
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Dotenv v17 Compatibility Test", () => {
  it("should use consistent dotenv import pattern across all scripts", () => {
    const scriptsToCheck = [
      "scripts/force-refresh-repo-stats.ts",
      "scripts/refresh-opengraph-images.ts",
      "scripts/submit-sitemap.ts",
    ];

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

    // Verify force-refresh-repo-stats.ts was updated to use the correct pattern
    expect(results["scripts/force-refresh-repo-stats.ts"]).toBe("import dotenv/config");
    
    // These should use their existing patterns
    expect(results["scripts/refresh-opengraph-images.ts"]).toBe("import dotenv/config");
    expect(results["scripts/submit-sitemap.ts"]).toBe("custom env loader");
  });
});