import fs from "node:fs";
import { POST as refreshBookmarksProduction } from "@/app/api/bookmarks/refresh-production/route";
import { GET as getGitHubActivity } from "@/app/api/github-activity/route";
import { POST as refreshGitHubActivityProduction } from "@/app/api/github-activity/refresh-production/route";
import { POST as refreshGitHubActivity } from "@/app/api/github-activity/refresh/route";
import { POST as logClientError } from "@/app/api/log-client-error/route";
import { refreshGitHubActivityDataFromApi } from "@/lib/data-access/github";
import { getGithubActivityCached } from "@/lib/data-access/github-public-api";
import { resolveDatabaseAccessMode } from "@/lib/db/connection";
import { getErrorMessage } from "@/lib/utils/error-utils";
import { apiErrorResponseSchema, clientErrorSchema } from "@/types/schemas/api";
import { bookmarkRefreshResponseSchema } from "@/types/schemas/bookmark";
import { createUnavailableUserActivityView } from "@/types/schemas/github-storage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connection, NextRequest } from "next/server";

const mockedAuth = vi.hoisted(() => vi.fn((userId: string | null = null) => ({ userId })));

vi.mock("@clerk/nextjs/server", () => ({ auth: mockedAuth }));
vi.mock("@/lib/data-access/github", () => ({
  refreshGitHubActivityDataFromApi: vi.fn(),
}));

vi.mock("@/lib/data-access/github-public-api", () => ({ getGithubActivityCached: vi.fn() }));
vi.mock("@/lib/db/connection", () => ({
  resolveDatabaseAccessMode: vi.fn(),
}));

const productionRefreshRoutes = [
  { name: "bookmarks", post: refreshBookmarksProduction },
  { name: "GitHub activity", post: refreshGitHubActivityProduction },
];

const relayFetch = vi.fn();
const mockedRefreshGitHubActivityDataFromApi = vi.mocked(refreshGitHubActivityDataFromApi);
const mockedGetGithubActivityCached = vi.mocked(getGithubActivityCached);
const mockedResolveDatabaseAccessMode = vi.mocked(resolveDatabaseAccessMode);
const unavailableGitHubActivity = createUnavailableUserActivityView({ source: "empty" });
const githubActivityUrl = "http://localhost:3000/api/github-activity";
function expectNoStoreResponse(response: Response, status: number): void {
  expect(response.status).toBe(status);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(connection).toHaveBeenCalledOnce();
}

describe("API error response handling", () => {
  it("validates typed client-error telemetry fields and rejects unknown keys", () => {
    const telemetry = {
      message: "Chunk failed to load",
      chunkId: "app-layout",
      performance: { durationMs: 125, cached: false },
    };

    expect(clientErrorSchema.parse(telemetry)).toEqual(telemetry);
    expect(
      clientErrorSchema.safeParse({ ...telemetry, diagnostics: { retryCount: 2 } }).success,
    ).toBe(false);
  });

  it("writes typed client-error telemetry to the server log", async () => {
    const appendFile = vi.spyOn(fs.promises, "appendFile").mockResolvedValue();
    const existsSync = vi.spyOn(fs, "existsSync").mockReturnValue(true);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const telemetry = {
      message: "Chunk failed to load",
      chunkId: "app-layout",
      performance: { durationMs: 125 },
    };

    try {
      const request = Object.assign(
        new NextRequest("http://localhost:3000/api/log-client-error", { method: "POST" }),
        { json: async () => telemetry },
      );
      const response = await logClientError(request);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ success: true });
      expect(appendFile).toHaveBeenCalledOnce();
      expect(String(appendFile.mock.calls[0]?.[1])).toContain('"chunkId":"app-layout"');
    } finally {
      appendFile.mockRestore();
      existsSync.mockRestore();
      consoleError.mockRestore();
    }
  });

  it("returns a parsed message error", () => {
    const error = apiErrorResponseSchema.parse({ message: "Message error" });

    expect(getErrorMessage(error, "Fallback error")).toBe("Message error");
  });

  it("returns a parsed error field", () => {
    const error = apiErrorResponseSchema.parse({ error: "Error field" });

    expect(getErrorMessage(error, "Fallback error")).toBe("Error field");
  });

  it("falls back for missing and malformed error payloads", () => {
    expect(getErrorMessage({}, "Fallback error")).toBe("Fallback error");
    expect(getErrorMessage({ error: 500 }, "Fallback error")).toBe("Fallback error");
  });
});

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

describe("GitHub activity GET route", () => {
  it("returns no-store after calling connection on activity data", async () => {
    mockedGetGithubActivityCached.mockResolvedValueOnce(unavailableGitHubActivity);
    const response = await getGitHubActivity(new NextRequest(githubActivityUrl));
    expectNoStoreResponse(response, 200);
  });

  it("returns no-store after calling connection on refresh guidance", async () => {
    const response = await getGitHubActivity(new NextRequest(`${githubActivityUrl}?refresh=true`));
    expectNoStoreResponse(response, 400);
  });

  it("returns no-store after calling connection on data access failure", async () => {
    mockedGetGithubActivityCached.mockRejectedValueOnce(
      new Error("GitHub activity data access failed"),
    );
    const response = await getGitHubActivity(new NextRequest(githubActivityUrl));
    expectNoStoreResponse(response, 500);
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
