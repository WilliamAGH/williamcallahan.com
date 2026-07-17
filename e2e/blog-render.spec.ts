import { expect, test, type Page } from "@playwright/test";
import { BLOG_RENDER_CANARIES } from "../config/blog-render-canaries";

type PageFailureCollector = {
  readonly pageErrors: string[];
  readonly ownedRequestFailures: string[];
};

const pageFailureCollectors = new WeakMap<Page, PageFailureCollector>();
const mdxRenderError =
  "Unable to render this portion of the article. Please refresh or contact support if the issue persists.";
const tweetEmbedRequest =
  /https?:\/\/(?:(?:[^/]+\.)?(?:twitter\.com|x\.com|twimg\.com)|react-tweet\.vercel\.app)(?:\/|$)/i;

function createPageFailureCollector(page: Page, ownedOrigin: string): PageFailureCollector {
  const collector: PageFailureCollector = {
    pageErrors: [],
    ownedRequestFailures: [],
  };

  page.on("pageerror", (error) => {
    collector.pageErrors.push(error.message);
  });
  page.on("requestfailed", (request) => {
    if (new URL(request.url()).origin !== ownedOrigin) return;
    collector.ownedRequestFailures.push(
      `${request.method()} ${request.url()} ${request.failure()?.errorText}`,
    );
  });

  return collector;
}

async function renderCanary(page: Page, canary: (typeof BLOG_RENDER_CANARIES)[number]) {
  const response = await page.goto(`/blog/${canary.slug}`, { waitUntil: "domcontentloaded" });
  expect(response, `Expected a main document response for ${canary.slug}.`).not.toBeNull();
  if (response === null) {
    throw new Error(`The main document response was null for ${canary.slug}.`);
  }
  expect(response.status(), `Unexpected response for ${canary.slug}.`).toBe(200);

  await expect(
    page.getByRole("heading", { level: 1, name: canary.title, exact: true }),
  ).toBeVisible();

  const article = page.locator("article.blog-content");
  await expect(article).toBeVisible();
  await expect(page.getByText("Loading content...", { exact: true })).not.toBeVisible();
  await expect(page.getByText(mdxRenderError, { exact: true })).not.toBeVisible();

  for (const marker of canary.markers) {
    await expect(article.getByText(marker.text)).toBeVisible();
  }

  return article;
}

test.beforeEach(async ({ page }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  if (typeof baseURL !== "string") {
    throw new Error("The Playwright project must define a string baseURL.");
  }

  await page.route(tweetEmbedRequest, (route) => route.abort());
  pageFailureCollectors.set(page, createPageFailureCollector(page, new URL(baseURL).origin));
});

test.afterEach(({ page }) => {
  const collector = pageFailureCollectors.get(page);
  if (collector === undefined) {
    throw new Error("No page failure collector was registered for this test.");
  }

  expect(collector.pageErrors, "Unexpected browser page errors.").toEqual([]);
  expect(collector.ownedRequestFailures, "Unexpected failed same-origin requests.").toEqual([]);
});

for (const canary of BLOG_RENDER_CANARIES) {
  test(`renders ${canary.slug}`, async ({ page }) => {
    const article = await renderCanary(page, canary);

    for (const interaction of canary.interactions) {
      const summary = article.locator("summary").filter({ hasText: interaction.summary });
      await expect(summary).toHaveCount(1);
      await summary.click();
      await expect(article.getByText(interaction.revealedContent)).toBeVisible();
    }
  });
}
