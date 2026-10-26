import { expect, test } from "@playwright/test";
import { BLOG_RENDER_CANARIES } from "../config/blog-render-canaries";

test.describe("blog tag SEO", () => {
  // "symlink" occurs only on the existing draft post, including in dev mode.
  for (const tagSlug of ["source-audit-nonexistent-20261025", "symlink", "__placeholder__"]) {
    test(`does not index missing or unpublished tag ${tagSlug}`, async ({ page }) => {
      await page.goto(`/blog/tags/${tagSlug}`, { waitUntil: "domcontentloaded" });

      await expect(page.getByRole("heading", { level: 1, name: "404", exact: true })).toBeVisible();
      await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
      await expect(page.getByText("No posts found for this tag.", { exact: true })).toHaveCount(0);
    });
  }

  test("preserves a published tag and its article links", async ({ page }) => {
    const response = await page.goto("/blog/tags/cloud", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { level: 1, name: "Cloud Posts", exact: true }),
    ).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /\/blog\/tags\/cloud$/,
    );
    await expect(
      page.locator(`a[href="/blog/${BLOG_RENDER_CANARIES[0].slug}"]`).first(),
    ).toBeVisible();
  });
});
