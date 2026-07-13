import * as Sentry from "@sentry/nextjs";
import { GET as getGitHubActivity } from "@/app/api/github-activity/route";
import { POST as refreshGitHubActivityProduction } from "@/app/api/github-activity/refresh-production/route";
import { POST as refreshGitHubActivity } from "@/app/api/github-activity/refresh/route";
import { refreshGitHubActivityDataFromApi } from "@/lib/data-access/github";
import { getGithubActivityCached } from "@/lib/data-access/github-public-api";
import { resolveDatabaseAccessMode } from "@/lib/db/connection";
import { runGitHubActivityRefresh } from "@/lib/server/github-activity-refresh";
import { getMonotonicTime } from "@/lib/utils";
import { invalidateAllGitHubCaches } from "@/lib/cache/invalidation";
import { createUnavailableUserActivityView } from "@/types/schemas/github-storage";
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
vi.mock("@/lib/cache/invalidation", () => ({
  invalidateAllGitHubCaches: vi.fn(),
}));
vi.mock("@/lib/utils", () => ({
  getMonotonicTime: vi.fn(),
}));
vi.mock("@/lib/utils/logger", () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

const mockedRefreshGitHubActivityDataFromApi = vi.mocked(refreshGitHubActivityDataFromApi);
const mockedGetGithubActivityCached = vi.mocked(getGithubActivityCached);
const mockedResolveDatabaseAccessMode = vi.mocked(resolveDatabaseAccessMode);
const mockedGetMonotonicTime = vi.mocked(getMonotonicTime);
const mockedInvalidateAllGitHubCaches = vi.mocked(invalidateAllGitHubCaches);
const mockedCaptureException = vi.mocked(Sentry.captureException);
const relayFetch = vi.fn();

const refreshedActivity = {
  trailingYearData: {
    source: "api",
    data: [],
    totalContributions: 12,
    linesAdded: 120,
    linesRemoved: 30,
    dataComplete: true,
  },
  allTimeData: {
    source: "api",
    data: [],
    totalContributions: 42,
    linesAdded: 420,
    linesRemoved: 90,
    dataComplete: true,
  },
} satisfies NonNullable<Awaited<ReturnType<typeof refreshGitHubActivityDataFromApi>>>;

const unavailableGitHubActivity = createUnavailableUserActivityView({ source: "empty" });
const githubActivityUrl = "http://localhost:3000/api/github-activity";

function expectNoStoreResponse(response: Response, status: number): void {
  expect(response.status).toBe(status);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(connection).toHaveBeenCalledOnce();
}

describe("GitHub activity refresh routes", () => {
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

  it("returns an explicit read-only result without refreshing GitHub data", async () => {
    const response = await refreshGitHubActivity(
      new NextRequest("http://localhost:3000/api/github-activity/refresh", { method: "POST" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ dataFetched: false, readOnly: true });
    expect(mockedRefreshGitHubActivityDataFromApi).not.toHaveBeenCalled();
  });

  it("returns 401 before relaying when optional Clerk authentication is unavailable", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    vi.stubEnv("CLERK_SECRET_KEY", "");
    mockedAuth.mockRejectedValueOnce(
      new Error("Clerk: auth() was called but Clerk can't detect usage of clerkMiddleware()."),
    );

    const response = await refreshGitHubActivityProduction();

    expect(response.status).toBe(401);
    expect(relayFetch).not.toHaveBeenCalled();
  });

  it("returns 401 before relaying without a Clerk user", async () => {
    const response = await refreshGitHubActivityProduction();

    expect(response.status).toBe(401);
    expect(relayFetch).not.toHaveBeenCalled();
  });

  it("surfaces unexpected Clerk failures", async () => {
    mockedAuth.mockRejectedValueOnce(new Error("Clerk authentication service unavailable"));

    await expect(refreshGitHubActivityProduction()).rejects.toThrow(
      "Clerk authentication service unavailable",
    );
    expect(relayFetch).not.toHaveBeenCalled();
  });

  it("returns 403 in production without relaying", async () => {
    mockedResolveDatabaseAccessMode.mockReturnValueOnce({
      allowWrites: true,
      environment: "production",
      source: "DEPLOYMENT_ENV",
    });

    const response = await refreshGitHubActivityProduction();

    expect(response.status).toBe(403);
    expect(relayFetch).not.toHaveBeenCalled();
  });

  it("relays an authenticated refresh with the production endpoint header", async () => {
    vi.stubEnv("GITHUB_REFRESH_SECRET", "github-refresh-secret");
    mockedAuth.mockReturnValueOnce({ userId: "user_test" });
    relayFetch.mockResolvedValueOnce(
      Response.json({
        message: "GitHub activity data refresh completed successfully.",
        dataFetched: true,
        trailingYearCommits: 365,
        allTimeCommits: 1_000,
      }),
    );

    const response = await refreshGitHubActivityProduction();

    expect(response.status).toBe(200);
    expect(relayFetch).toHaveBeenCalledWith(
      "https://williamcallahan.com/api/github-activity/refresh",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-refresh-secret": "github-refresh-secret" }),
      }),
    );
  });

  it.each([
    [
      "a read-only result",
      Response.json({ message: "Read-only", dataFetched: false, readOnly: true }),
      "Production did not perform the GitHub activity refresh",
    ],
    ["invalid JSON", new Response("not-json"), "Production returned invalid response format"],
  ])("rejects %s from production", async (_case, productionResponse, message) => {
    vi.stubEnv("GITHUB_REFRESH_SECRET", "github-refresh-secret");
    mockedAuth.mockReturnValueOnce({ userId: "user_test" });
    relayFetch.mockResolvedValueOnce(productionResponse);

    const response = await refreshGitHubActivityProduction();

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ message });
  });
});

describe("GET /api/github-activity", () => {
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

describe("runGitHubActivityRefresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetMonotonicTime.mockReturnValueOnce(1_000).mockReturnValueOnce(1_500);
  });

  it("reports a read-only deployment as a successful no-op", async () => {
    mockedResolveDatabaseAccessMode.mockReturnValue({
      allowWrites: false,
      environment: "development",
      source: "NEXT_PUBLIC_SITE_URL",
    });

    await expect(runGitHubActivityRefresh()).resolves.toEqual({
      success: true,
      operation: "github-activity",
      itemsProcessed: 0,
      duration: 0.5,
    });
    expect(mockedRefreshGitHubActivityDataFromApi).not.toHaveBeenCalled();
    expect(mockedInvalidateAllGitHubCaches).not.toHaveBeenCalled();
    expect(mockedCaptureException).not.toHaveBeenCalled();
  });

  it("refreshes and invalidates caches in the production write environment", async () => {
    mockedResolveDatabaseAccessMode.mockReturnValue({
      allowWrites: true,
      environment: "production",
      source: "NEXT_PUBLIC_SITE_URL",
    });
    mockedRefreshGitHubActivityDataFromApi.mockResolvedValue(refreshedActivity);

    await expect(runGitHubActivityRefresh()).resolves.toEqual({
      success: true,
      operation: "github-activity",
      itemsProcessed: 12,
      duration: 0.5,
    });
    expect(mockedRefreshGitHubActivityDataFromApi).toHaveBeenCalledOnce();
    expect(mockedInvalidateAllGitHubCaches).toHaveBeenCalledOnce();
    expect(mockedCaptureException).not.toHaveBeenCalled();
  });

  it("reports unexpected production refresh failures to Sentry", async () => {
    const refreshError = new Error("GitHub API unavailable");
    mockedResolveDatabaseAccessMode.mockReturnValue({
      allowWrites: true,
      environment: "production",
      source: "NEXT_PUBLIC_SITE_URL",
    });
    mockedRefreshGitHubActivityDataFromApi.mockRejectedValue(refreshError);

    await expect(runGitHubActivityRefresh()).resolves.toEqual({
      success: false,
      operation: "github-activity",
      error: refreshError.message,
      duration: 0.5,
    });
    expect(mockedCaptureException).toHaveBeenCalledOnce();
    expect(mockedCaptureException).toHaveBeenCalledWith(refreshError);
    expect(mockedInvalidateAllGitHubCaches).not.toHaveBeenCalled();
  });
});
