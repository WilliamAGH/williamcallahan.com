import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression guard for the mobile blog-rendering incident: `word-break: break-all`
 * inside `.blog-content` split link text and inline code mid-character ("default o/f",
 * "xhig/h"). Links and inline code must wrap at word boundaries only.
 */
const globalsCss = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

const blogContentRules = globalsCss.split("}").filter((block) => block.includes(".blog-content"));

describe("globals.css .blog-content wrapping rules", () => {
  it("never applies word-break: break-all within .blog-content", () => {
    for (const block of blogContentRules) {
      expect(block).not.toMatch(/word-break\s*:\s*break-all/);
    }
  });

  it("forces pre-wrap only on block code (<pre> / <pre> code), not bare inline <code>", () => {
    const preWrapRules = globalsCss
      .split("}")
      .filter((block) => block.includes("pre-wrap") && block.includes(".blog-content"));
    expect(preWrapRules.length).toBeGreaterThan(0);
    for (const block of preWrapRules) {
      // Selector portion (before the opening brace) must not target a bare `.blog-content code`
      const selector = block.split("{")[0] ?? "";
      expect(selector).not.toMatch(/\.blog-content\s+code\s*(,|$)/);
    }
  });
});
