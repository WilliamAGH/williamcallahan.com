import { POST as refreshBookmarksProduction } from "@/app/api/bookmarks/refresh-production/route";
import { POST as refreshGitHubActivityProduction } from "@/app/api/github-activity/refresh-production/route";
import { POST as refreshGitHubActivity } from "@/app/api/github-activity/refresh/route";
import { refreshGitHubActivityDataFromApi } from "@/lib/data-access/github";
import { resolveDatabaseAccessMode } from "@/lib/db/connection";
import { bookmarkRefreshResponseSchema } from "@/types/schemas/bookmark";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockedAuth = vi.hoisted(() => vi.fn((userId: string | null = null) => ({ userId })));

vi.mock("@clerk/nextjs/server", () => ({ auth: mockedAuth }));
vi.mock("@/lib/data-access/github", () => ({
  refreshGitHubActivityDataFromApi: vi.fn(),
}));

vi.mock("@/lib/db/connection", () => ({
  resolveDatabaseAccessMode: vi.fn(),
}));

const productionRefreshRoutes = [
  { name: "bookmarks", post: refreshBookmarksProduction },
  { name: "GitHub activity", post: refreshGitHubActivityProduction },
];

const relayFetch = vi.fn();
const mockedRefreshGitHubActivityDataFromApi = vi.mocked(refreshGitHubActivityDataFromApi);
const mockedResolveDatabaseAccessMode = vi.mocked(resolveDatabaseAccessMode);

describe("bookmark refresh response contract", () => {
  it("rejects malformed refresh payloads", () => {
    expect(bookmarkRefreshResponseSchema.safeParse({}).success).toBe(false);
    expect(
      bookmarkRefreshResponseSchema.safeParse({
        status: "pending",
        message: "Refresh pending",
        data: {},
      }).success,
    ).toBe(false);
    expect(
      bookmarkRefreshResponseSchema.safeParse({
        status: "success",
        message: "Refresh complete",
      }).success,
    ).toBe(false);
  });
});

describe("production refresh relay routes", () => {
  beforeEach(() => {
    relayFetch.mockReset();
    mockedAuth.mockClear();
    mockedRefreshGitHubActivityDataFromApi.mockReset();
    mockedResolveDatabaseAccessMode.mockReset();
    mockedResolveDatabaseAccessMode.mockReturnValue({
      allowWrites: false,
      environment: "development",
      source: "NEXT_PUBLIC_SITE_URL",
    });
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
      mockedResolveDatabaseAccessMode.mockReturnValueOnce({
        allowWrites: true,
        environment: "production",
        source: "DEPLOYMENT_ENV",
      });

      const response = await post();

      expect(response.status).toBe(403);
      expect(relayFetch).not.toHaveBeenCalled();
    });
  }

  it("returns an explicit read-only result without refreshing GitHub data", async () => {
    mockedResolveDatabaseAccessMode.mockReturnValueOnce({
      allowWrites: false,
      environment: "development",
      source: "NEXT_PUBLIC_SITE_URL",
    });

    const response = await refreshGitHubActivity(
      new NextRequest("http://localhost:3000/api/github-activity/refresh", { method: "POST" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message:
        "GitHub activity refresh is read-only in this deployment. Refresh production to update the shared dataset.",
      dataFetched: false,
      readOnly: true,
    });
    expect(mockedRefreshGitHubActivityDataFromApi).not.toHaveBeenCalled();
  });

  it("relays an authenticated GitHub refresh with the production endpoint header", async () => {
    vi.stubEnv("DEPLOYMENT_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://dev.williamcallahan.com");
    vi.stubEnv("GITHUB_REFRESH_SECRET", "github-refresh-secret");
    mockedAuth.mockReturnValueOnce({ userId: "user_test" });
    relayFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: "GitHub activity data refresh completed successfully.",
          dataFetched: true,
          trailingYearCommits: 365,
          allTimeCommits: 1_000,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const response = await refreshGitHubActivityProduction();

    expect(response.status).toBe(200);
    expect(relayFetch).toHaveBeenCalledWith(
      "https://williamcallahan.com/api/github-activity/refresh",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-refresh-secret": "github-refresh-secret",
        },
      },
    );
    await expect(response.json()).resolves.toEqual({
      message: "Production refresh initiated successfully",
      productionResponse: {
        message: "GitHub activity data refresh completed successfully.",
        dataFetched: true,
        trailingYearCommits: 365,
        allTimeCommits: 1_000,
      },
    });
  });

  it("rejects a 2xx production bookmark refresh error response", async () => {
    vi.stubEnv("DEPLOYMENT_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://dev.williamcallahan.com");
    vi.stubEnv("BOOKMARK_REFRESH_SECRET", "bookmark-refresh-secret");
    mockedAuth.mockReturnValueOnce({ userId: "user_test" });
    relayFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "error",
          message: "Production refresh failed",
          error: "Upstream failure",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const response = await refreshBookmarksProduction();

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      message: "Failed to trigger production bookmarks refresh",
      error: "Upstream failure",
    });
  });

  it("rejects a read-only response from the production refresh endpoint", async () => {
    vi.stubEnv("DEPLOYMENT_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://dev.williamcallahan.com");
    vi.stubEnv("GITHUB_REFRESH_SECRET", "github-refresh-secret");
    mockedAuth.mockReturnValueOnce({ userId: "user_test" });
    relayFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: "GitHub activity refresh is read-only in this deployment.",
          dataFetched: false,
          readOnly: true,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const response = await refreshGitHubActivityProduction();

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      message: "Production did not perform the GitHub activity refresh",
      error: "Production deployment is read-only",
    });
  });

  it("rejects invalid JSON from the production refresh endpoint", async () => {
    vi.stubEnv("DEPLOYMENT_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://dev.williamcallahan.com");
    vi.stubEnv("GITHUB_REFRESH_SECRET", "github-refresh-secret");
    mockedAuth.mockReturnValueOnce({ userId: "user_test" });
    relayFetch.mockResolvedValueOnce(
      new Response("not-json", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await refreshGitHubActivityProduction();

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      message: "Production returned invalid response format",
      error: "Response validation failed",
    });
  });
});
