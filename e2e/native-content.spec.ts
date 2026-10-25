import { expect, test } from "@playwright/test";
import { projects } from "../data/projects";

// Run against a production build as well: development does not exercise the PPR shell.
const agents = [
  {
    name: "desktop",
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36",
  },
  {
    name: "googlebot",
    userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  },
  {
    name: "bingbot",
    userAgent: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  },
  { name: "twitterbot", userAgent: "Twitterbot/1.0" },
];

const projectRoutes = [
  { slug: "brief", id: "brief" },
  { slug: "aventure-vc", id: "aVenture.vc" },
];

for (const agent of agents) {
  test.describe(`native content / ${agent.name}`, () => {
    // Flight JSON and hydration cannot satisfy these DOM assertions.
    test.use({ javaScriptEnabled: false, userAgent: agent.userAgent });

    for (const route of projectRoutes) {
      test(`project ${route.slug} has native heading description and destination`, async ({
        page,
      }) => {
        const project = projects.find((entry) => entry.id === route.id);
        if (!project) throw new Error(`Missing project fixture: ${route.id}`);

        const response = await page.goto(`/projects/${route.slug}`, {
          waitUntil: "domcontentloaded",
        });
        expect(response?.status()).toBe(200);
        await expect(
          page.getByRole("heading", { level: 1, name: project.name, exact: true }),
        ).toBeVisible();
        await expect(page.getByText(project.description, { exact: true })).toBeVisible();
        await expect(
          page.getByRole("link", { name: "Visit Project", exact: true }),
        ).toHaveAttribute("href", project.url);
        if (project.shortSummary) {
          await expect(page.getByText(project.shortSummary, { exact: true })).toBeVisible();
        }
      });
    }

    test("contact has a native window heading before registration", async ({ page }) => {
      const response = await page.goto("/contact", { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBe(200);
      await expect(
        page.getByRole("heading", { level: 1, name: "~/contact", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Social Media Profiles", exact: true }),
      ).toBeVisible();
      await expect(page.locator(".social-card")).not.toHaveCount(0);
      await expect(
        page.locator('.social-card a[href="https://github.com/WilliamAGH"]').first(),
      ).toBeVisible();
    });
  });
}
