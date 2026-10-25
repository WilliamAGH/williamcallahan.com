import { expect, test } from "@playwright/test";
import { BLOG_RENDER_CANARIES } from "../config/blog-render-canaries";

// Crawlers that run no JavaScript index only what the server HTML shows. Content
// that streams into a hidden Suspense segment stays invisible to them, because a
// script reveals it.
test.use({ javaScriptEnabled: false });

test("the homepage shows its heading and introduction without JavaScript", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "William Callahan" })).toBeVisible();
  await expect(page.getByText("Hello there", { exact: false }).first()).toBeVisible();
});

test("a blog post shows its heading and opening without JavaScript", async ({ page }) => {
  const [canary] = BLOG_RENDER_CANARIES;
  await page.goto(`/blog/${canary.slug}`);

  await expect(
    page.getByRole("heading", { level: 1, name: canary.title, exact: true }),
  ).toBeVisible();
  const [opening] = canary.markers;
  await expect(page.getByText(opening.text)).toBeVisible();
});
