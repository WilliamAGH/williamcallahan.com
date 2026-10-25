import { expect, test } from "@playwright/test";
import { userActivityViewSchema } from "../src/types/schemas/github-storage";

test("preserves native weekday labels and responsive contribution rendering", async ({ page }) => {
  const activity = userActivityViewSchema.parse({
    source: "db-store",
    trailingYearData: {
      data: [
        { date: "2026-10-24", count: 1, level: 1 },
        { date: "2026-10-25", count: 2, level: 2 },
      ],
      totalContributions: 3,
      linesAdded: 10,
      linesRemoved: 2,
      dataComplete: true,
    },
    allTimeStats: { totalContributions: 3, linesAdded: 10, linesRemoved: 2 },
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /getBBox|SVG|activity/i.test(message.text())) {
      errors.push(message.text());
    }
  });
  await page.route("**/api/github-activity", (route) => route.fulfill({ json: activity }));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/projects?tag=Web%20Application");
  const calendar = page.locator("article.react-activity-calendar");
  await expect(calendar).toBeVisible();
  await expect(calendar.locator('rect[data-date="2026-10-25"]')).toHaveAttribute("data-level", "2");
  await expect(calendar.locator(".react-activity-calendar__legend-weekday")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(calendar.locator(".react-activity-calendar__legend-weekday")).toHaveCount(0);
  await expect(calendar.locator('rect[data-date="2026-10-25"]')).toHaveAttribute("width", "10");
  expect(errors).toEqual([]);
});
