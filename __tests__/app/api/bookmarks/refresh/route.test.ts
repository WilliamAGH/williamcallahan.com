import { auth } from "@clerk/nextjs/server";
import { POST as refreshBookmarksProduction } from "@/app/api/bookmarks/refresh-production/route";
import { POST as refreshGitHubActivityProduction } from "@/app/api/github-activity/refresh-production/route";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const productionRefreshRoutes = [
  { name: "bookmarks", post: refreshBookmarksProduction },
  { name: "GitHub activity", post: refreshGitHubActivityProduction },
];

const relayFetch = vi.fn();
const mockedAuth = vi.mocked(auth);

describe("production refresh relay routes", () => {
  beforeEach(() => {
    relayFetch.mockReset();
    vi.stubGlobal("fetch", relayFetch);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  for (const { name, post } of productionRefreshRoutes) {
    it(`returns 401 before relaying ${name} when optional Clerk authentication is unavailable`, async () => {
      vi.stubEnv("DEPLOYMENT_ENV", "development");
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
      vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
      vi.stubEnv("CLERK_SECRET_KEY", "");
      mockedAuth.mockRejectedValueOnce(
        new Error("Clerk: auth() was called but Clerk can't detect usage of clerkMiddleware()."),
      );

      const response = await post();

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
      expect(relayFetch).not.toHaveBeenCalled();
    });

    it(`returns 401 before relaying ${name} without a Clerk user`, async () => {
      vi.stubEnv("DEPLOYMENT_ENV", "development");
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");

      const response = await post();

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
      expect(relayFetch).not.toHaveBeenCalled();
    });

    it(`surfaces unexpected Clerk failures for ${name}`, async () => {
      vi.stubEnv("DEPLOYMENT_ENV", "development");
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
      mockedAuth.mockRejectedValueOnce(new Error("Clerk authentication service unavailable"));

      await expect(post()).rejects.toThrow("Clerk authentication service unavailable");
      expect(relayFetch).not.toHaveBeenCalled();
    });

    it(`returns 403 for ${name} in production without relaying`, async () => {
      vi.stubEnv("DEPLOYMENT_ENV", "production");

      const response = await post();

      expect(response.status).toBe(403);
      expect(relayFetch).not.toHaveBeenCalled();
    });
  }
});
