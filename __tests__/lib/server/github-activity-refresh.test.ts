import * as Sentry from "@sentry/nextjs";
import { GET as getGitHubActivity } from "@/app/api/github-activity/route";
import { POST as refreshGitHubActivityProduction } from "@/app/api/github-activity/refresh-production/route";
import { POST as refreshGitHubActivity } from "@/app/api/github-activity/refresh/route";
import { refreshGitHubActivityDataFromApi } from "@/lib/data-access/github";
import { readGitHubActivityRecord } from "@/lib/data-access/github-storage";
import { createGitHubActivitySummary } from "@/lib/data-access/github-activity-summaries";
import { getGithubActivityCached } from "@/lib/data-access/github-public-api";
import { createEmptyCategoryStats } from "@/lib/data-access/github-processing";
import { resolveDatabaseAccessMode } from "@/lib/db/connection";
import { runGitHubActivityRefresh } from "@/lib/server/github-activity-refresh";
import {
  GITHUB_ACTIVITY_PRESERVED_DATA_RETRY,
  GitHubActivityRefreshPreservedError,
  GitHubUpstreamUnavailableError,
} from "@/lib/data-access/github-refresh-outcome";
import { getMonotonicTime } from "@/lib/utils";
import { GitHubRefreshDeadlineError } from "@/lib/data-access/github-refresh-budget";
import { invalidateAllGitHubCaches } from "@/lib/cache/invalidation";
import {
  contributionDaySchema,
  createUnavailableUserActivityView,
  githubActivityRefreshSuccessResponseSchema,
  userActivityViewSchema,
} from "@/types/schemas/github-storage";
import { standardApiErrorResponseSchema } from "@/types/schemas/api";
import { connection, NextRequest } from "next/server";
import type logger from "@/lib/utils/logger";

const mockedAuth = vi.hoisted(() =>
  vi.fn<(userId?: string | null) => { userId: string | null }>((userId = null) => ({ userId })),
);

vi.mock("@clerk/nextjs/server", () => ({ auth: mockedAuth }));
vi.mock("@/lib/data-access/github", () => ({
  refreshGitHubActivityDataFromApi: vi.fn<typeof refreshGitHubActivityDataFromApi>(),
}));
vi.mock("@/lib/data-access/github-storage", () => ({
  readGitHubActivityRecord: vi.fn<typeof readGitHubActivityRecord>(),
}));
vi.mock("@/lib/data-access/github-public-api", () => ({
  getGithubActivityCached: vi.fn<typeof getGithubActivityCached>(),
}));
vi.mock("@/lib/db/connection", () => ({
  resolveDatabaseAccessMode: vi.fn<typeof resolveDatabaseAccessMode>(),
}));
vi.mock("@/lib/cache/invalidation", () => ({
  invalidateAllGitHubCaches: vi.fn<typeof invalidateAllGitHubCaches>(),
}));
vi.mock("@/lib/utils", () => ({
  getMonotonicTime: vi.fn<typeof getMonotonicTime>(),
}));
vi.mock("@/lib/utils/logger", () => ({
  default: {
    error: vi.fn<typeof logger.error>(),
    info: vi.fn<typeof logger.info>(),
    warn: vi.fn<typeof logger.warn>(),
  },
}));

const mockedRefreshGitHubActivityDataFromApi = vi.mocked(refreshGitHubActivityDataFromApi);
const mockedReadGitHubActivityRecord = vi.mocked(readGitHubActivityRecord);
const mockedGetGithubActivityCached = vi.mocked(getGithubActivityCached);
const mockedResolveDatabaseAccessMode = vi.mocked(resolveDatabaseAccessMode);
const mockedGetMonotonicTime = vi.mocked(getMonotonicTime);
const mockedInvalidateAllGitHubCaches = vi.mocked(invalidateAllGitHubCaches);
const mockedCaptureException = vi.mocked(Sentry.captureException);
const relayFetch = vi.fn<typeof fetch>();

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
const githubActivityRefreshUrl = `${githubActivityUrl}/refresh`;
const cronRefreshSecret = "github-activity-refresh-secret";
const productionAccess = {
  allowWrites: true,
  environment: "production",
  source: "NEXT_PUBLIC_SITE_URL",
} satisfies ReturnType<typeof resolveDatabaseAccessMode>;
const upstreamTimeout = new GitHubUpstreamUnavailableError(
  "upstream-timeout",
  new Error("timeout"),
);

function createAuthorizedGitHubActivityRefreshRequest(): NextRequest {
  return new NextRequest(githubActivityRefreshUrl, {
    method: "POST",
    headers: { authorization: `Bearer ${cronRefreshSecret}` },
  });
}

describe("GitHub activity refresh routes", () => {
  beforeEach(() => {
    relayFetch.mockReset();
    mockedAuth.mockClear();
    mockedRefreshGitHubActivityDataFromApi.mockReset();
    mockedInvalidateAllGitHubCaches.mockClear();
    mockedCaptureException.mockClear();
    mockedResolveDatabaseAccessMode.mockReset();
    mockedResolveDatabaseAccessMode.mockReturnValue({
      allowWrites: false,
      environment: "development",
      source: "NEXT_PUBLIC_SITE_URL",
    });
    vi.stubEnv("BOOKMARK_CRON_REFRESH_SECRET", cronRefreshSecret);
    vi.stubGlobal("fetch", relayFetch);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns an explicit read-only result without refreshing GitHub data", async () => {
    const response = await refreshGitHubActivity(
      new NextRequest(githubActivityRefreshUrl, { method: "POST" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ dataFetched: false, readOnly: true });
    expect(mockedRefreshGitHubActivityDataFromApi).not.toHaveBeenCalled();
  });

  it("returns a canonical retryable response when healthy activity is preserved", async () => {
    mockedResolveDatabaseAccessMode.mockReturnValueOnce(productionAccess);
    mockedRefreshGitHubActivityDataFromApi.mockRejectedValueOnce(
      new GitHubActivityRefreshPreservedError(),
    );

    const response = await refreshGitHubActivity(createAuthorizedGitHubActivityRefreshRequest());
    const body = standardApiErrorResponseSchema.parse(await response.json());
    const retryAfterSeconds = GITHUB_ACTIVITY_PRESERVED_DATA_RETRY.baseDelay / 1_000;

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe(String(retryAfterSeconds));
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.code).toBe("SERVICE_UNAVAILABLE");
    expect(body.status).toBe(response.status);
    expect(body.retryAfterSeconds).toBe(retryAfterSeconds);
    expect(mockedCaptureException).not.toHaveBeenCalled();
    expect(mockedInvalidateAllGitHubCaches).not.toHaveBeenCalled();
  });

  it("reports unexpected refresh failures as internal server errors", async () => {
    const refreshError = new Error("GitHub API unavailable");
    mockedResolveDatabaseAccessMode.mockReturnValueOnce(productionAccess);
    mockedRefreshGitHubActivityDataFromApi.mockRejectedValueOnce(refreshError);

    const response = await refreshGitHubActivity(createAuthorizedGitHubActivityRefreshRequest());

    expect(response.status).toBe(500);
    expect(mockedCaptureException).toHaveBeenCalledOnce();
    expect(mockedCaptureException).toHaveBeenCalledWith(refreshError);
    expect(mockedInvalidateAllGitHubCaches).not.toHaveBeenCalled();
  });

  it("returns the successful refresh result after invalidating caches", async () => {
    mockedResolveDatabaseAccessMode.mockReturnValueOnce(productionAccess);
    mockedRefreshGitHubActivityDataFromApi.mockResolvedValueOnce(refreshedActivity);

    const response = await refreshGitHubActivity(createAuthorizedGitHubActivityRefreshRequest());
    const body = githubActivityRefreshSuccessResponseSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      dataFetched: true,
      trailingYearCommits: refreshedActivity.trailingYearData.totalContributions,
      allTimeCommits: refreshedActivity.allTimeData.totalContributions,
    });
    expect(mockedInvalidateAllGitHubCaches).toHaveBeenCalledOnce();
    expect(mockedCaptureException).not.toHaveBeenCalled();
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

  it("forwards a canonical retryable production refresh response", async () => {
    vi.stubEnv("GITHUB_REFRESH_SECRET", "github-refresh-secret");
    mockedAuth.mockReturnValueOnce({ userId: "user_test" });
    const frozenNow = new Date("2026-08-05T21:00:00.000Z");
    const retryableResponse = standardApiErrorResponseSchema.parse({
      code: "SERVICE_UNAVAILABLE",
      message: "GitHub activity refresh preserved existing healthy activity data.",
      retryAfterSeconds: 5,
      retryAfterAt: "2020-01-01T00:00:05.000Z",
      status: 503,
    });
    relayFetch.mockResolvedValueOnce(
      Response.json(retryableResponse, {
        status: 503,
        headers: { "Cache-Control": "no-store", "Retry-After": "5" },
      }),
    );

    vi.useFakeTimers();
    try {
      vi.setSystemTime(frozenNow);
      const response = await refreshGitHubActivityProduction();
      const body = standardApiErrorResponseSchema.parse(await response.json());

      expect(response.status).toBe(503);
      expect(response.headers.get("Retry-After")).toBe("5");
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(body).toMatchObject({
        code: retryableResponse.code,
        message: retryableResponse.message,
        retryAfterSeconds: retryableResponse.retryAfterSeconds,
        status: retryableResponse.status,
      });
      expect(body.retryAfterAt).toBe("2026-08-05T21:00:05.000Z");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not reinterpret an inconsistent upstream 429 as service unavailable", async () => {
    vi.stubEnv("GITHUB_REFRESH_SECRET", "github-refresh-secret");
    mockedAuth.mockReturnValueOnce({ userId: "user_test" });
    const inconsistentResponse = standardApiErrorResponseSchema.parse({
      code: "SERVICE_UNAVAILABLE",
      message: "Upstream response has inconsistent rate-limit semantics.",
      retryAfterSeconds: 5,
      retryAfterAt: "2026-08-05T21:00:05.000Z",
      status: 429,
    });
    relayFetch.mockResolvedValueOnce(Response.json(inconsistentResponse, { status: 429 }));

    const response = await refreshGitHubActivityProduction();

    expect(response.status).toBe(429);
    expect(response.headers.has("Retry-After")).toBe(false);
    await expect(response.json()).resolves.toMatchObject({
      message: "Failed to trigger production refresh",
      error: inconsistentResponse.message,
    });
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
  it.each([
    { outcome: "activity data", query: "", status: 200 },
    { outcome: "refresh guidance", query: "?refresh=true", status: 400 },
    { outcome: "data access failure", query: "", status: 500 },
  ])("returns no-store after calling connection on $outcome", async ({ query, status }) => {
    if (status === 500) {
      mockedGetGithubActivityCached.mockRejectedValueOnce(
        new Error("GitHub activity data access failed"),
      );
    } else if (status === 200) {
      mockedGetGithubActivityCached.mockResolvedValueOnce(unavailableGitHubActivity);
    }
    const response = await getGitHubActivity(new NextRequest(`${githubActivityUrl}${query}`));
    expect(response.status).toBe(status);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(connection).toHaveBeenCalledOnce();
  });
});

describe("GitHub activity public schemas", () => {
  it("rejects values the public view cannot render", () => {
    expect(
      contributionDaySchema.safeParse({ date: "not-a-date", count: 1, level: 1 }).success,
    ).toBe(false);
    expect(
      contributionDaySchema.safeParse({ date: "2026-07-13", count: -1, level: 1 }).success,
    ).toBe(false);
    expect(
      userActivityViewSchema.safeParse({
        source: "empty",
        trailingYearData: { data: [], totalContributions: 0, dataComplete: false },
        allTimeStats: { totalContributions: 0, linesAdded: 0, linesRemoved: 0 },
        lastRefreshed: "not-a-date",
      }).success,
    ).toBe(false);
  });
});

describe("GitHub activity summary", () => {
  it("preserves repository counts and calculates net lines", () => {
    const categories = createEmptyCategoryStats();
    categories.frontend.repoCount = 2;
    categories.backend.repoCount = 1;
    const summary = createGitHubActivitySummary({
      allTimeData: { ...refreshedActivity.allTimeData, linesAdded: 14, linesRemoved: 5 },
      totalRepositoriesContributedTo: 3,
      linesOfCodeByCategory: categories,
    });

    expect(summary.netLinesOfCode).toBe(9);
    expect(summary.totalRepositoriesContributedTo).toBe(3);
    expect(summary.linesOfCodeByCategory).toEqual(categories);
  });
});

describe("runGitHubActivityRefresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedResolveDatabaseAccessMode.mockReturnValue(productionAccess);
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

  it.each([
    ["unclassified failure", new Error("GitHub API unavailable"), false, false],
    ["unclassified timeout", new Error("Request timeout after 30000ms: database"), true, false],
    ["no retained activity", upstreamTimeout, false, false],
    ["invalid retained activity", upstreamTimeout, new Error("Invalid persisted activity"), false],
    ["retained activity", upstreamTimeout, true, true],
    ["total deadline with retained activity", new GitHubRefreshDeadlineError(), true, true],
    ["total deadline without retained activity", new GitHubRefreshDeadlineError(), false, false],
  ] satisfies Array<[string, Error, boolean | Error, boolean]>)(
    "classifies %s (%s)",
    async (_case, refreshError, retained, degraded) => {
      mockedRefreshGitHubActivityDataFromApi.mockRejectedValue(refreshError);
      if (retained instanceof Error) mockedReadGitHubActivityRecord.mockRejectedValue(retained);
      else
        mockedReadGitHubActivityRecord.mockResolvedValue(
          retained
            ? {
                trailingYearData: refreshedActivity.trailingYearData,
                cumulativeAllTimeData: refreshedActivity.allTimeData,
              }
            : null,
        );
      await expect(runGitHubActivityRefresh()).resolves.toMatchObject({
        success: degraded,
        operation: "github-activity",
        ...(degraded
          ? {
              degraded: true,
              reason: "reason" in refreshError ? refreshError.reason : undefined,
              itemsProcessed: 0,
            }
          : { error: (retained instanceof Error ? retained : refreshError).message }),
        duration: 0.5,
      });
      expect(mockedCaptureException).toHaveBeenCalledTimes(degraded ? 0 : 1);
      expect(mockedRefreshGitHubActivityDataFromApi).toHaveBeenCalledOnce();
      expect(mockedInvalidateAllGitHubCaches).not.toHaveBeenCalled();
    },
  );

  it("retries preserved healthy activity with bounded backoff and lets bootstrap continue", async () => {
    mockedRefreshGitHubActivityDataFromApi.mockRejectedValue(
      new GitHubActivityRefreshPreservedError(),
    );

    vi.useFakeTimers();
    try {
      const refresh = runGitHubActivityRefresh();
      await vi.runAllTimersAsync();

      await expect(refresh).resolves.toEqual({
        success: true,
        operation: "github-activity",
        itemsProcessed: 0,
        degraded: true,
        reason: "preserved-healthy-activity",
        duration: 0.5,
      });
      expect(mockedRefreshGitHubActivityDataFromApi).toHaveBeenCalledTimes(
        GITHUB_ACTIVITY_PRESERVED_DATA_RETRY.maxRetries + 1,
      );
      expect(mockedCaptureException).not.toHaveBeenCalled();
      expect(mockedInvalidateAllGitHubCaches).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
