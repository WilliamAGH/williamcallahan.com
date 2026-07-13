import * as Sentry from "@sentry/nextjs";
import { GET as getGitHubActivity } from "@/app/api/github-activity/route";
import { refreshGitHubActivityDataFromApi } from "@/lib/data-access/github";
import { getGithubActivityCached } from "@/lib/data-access/github-public-api";
import { resolveDatabaseAccessMode } from "@/lib/db/connection";
import { runGitHubActivityRefresh } from "@/lib/server/github-activity-refresh";
import { getMonotonicTime } from "@/lib/utils";
import { invalidateAllGitHubCaches } from "@/lib/cache/invalidation";
import { createUnavailableUserActivityView } from "@/types/schemas/github-storage";
import { connection, NextRequest } from "next/server";

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
