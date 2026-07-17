// @vitest-environment node
import { createRequire } from "node:module";
import { BLOG_RENDER_CANARIES } from "@/config/blog-render-canaries";
import { vi } from "vitest";

vi.mock("cheerio", () => createRequire(import.meta.url)("cheerio"));

import {
  MDX_RENDER_FALLBACK_MESSAGE,
  validateBlogRenderHtml,
} from "../../scripts/blog-render-smoke";

const canary = BLOG_RENDER_CANARIES.at(0);
if (canary === undefined) {
  throw new Error("BLOG_RENDER_CANARIES must provide at least one article canary");
}

const completeContent = canary.markers.map((marker) => marker.text).join(" ");

function renderBlogHtml(content: string, title: string = canary.title): string {
  return `<article><h1>${title}</h1><article class="blog-content">${content}</article></article>`;
}

describe("validateBlogRenderHtml", () => {
  it("accepts a complete rendered blog article", () => {
    expect(validateBlogRenderHtml(renderBlogHtml(`<p>${completeContent}</p>`), canary)).toBe(true);
  });

  it("rejects a document without blog content", () => {
    expect(validateBlogRenderHtml(`<h1>${canary.title}</h1>`, canary)).toBe(false);
  });

  it("rejects a document without the exact title", () => {
    expect(
      validateBlogRenderHtml(renderBlogHtml(`<p>${completeContent}</p>`, "Other title"), canary),
    ).toBe(false);
  });

  it("rejects blank article content", () => {
    expect(validateBlogRenderHtml(renderBlogHtml(""), canary)).toBe(false);
  });

  it("rejects title-only article content", () => {
    expect(validateBlogRenderHtml(renderBlogHtml(`<h2>${canary.title}</h2>`), canary)).toBe(false);
  });

  for (const marker of canary.markers) {
    it(`rejects content missing the ${marker.section} marker`, () => {
      const truncatedContent = completeContent.replace(marker.text, "");
      expect(validateBlogRenderHtml(renderBlogHtml(`<p>${truncatedContent}</p>`), canary)).toBe(
        false,
      );
    });
  }

  it("rejects the visible MDX render fallback", () => {
    const contentWithFallback = `<p>${completeContent}</p><p>${MDX_RENDER_FALLBACK_MESSAGE}</p>`;
    expect(validateBlogRenderHtml(renderBlogHtml(contentWithFallback), canary)).toBe(false);
  });
});
