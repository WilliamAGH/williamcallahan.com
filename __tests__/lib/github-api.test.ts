import { z } from "zod/v4";
import {
  fetchContributedRepositories,
  fetchContributionCalendar,
  fetchContributionYears,
  fetchContributorStats,
} from "@/lib/data-access/github-api";
import { ContributorStatsResponseSchema, GraphQLRepoNodeSchema } from "@/types/github";
import { filterContributorStats } from "@/lib/data-access/github-processing";
import { getTrailingYearDate } from "@/lib/utils/date-format";
import { GitHubUpstreamUnavailableError } from "@/lib/data-access/github-refresh-outcome";
import { GitHubRefreshDeadlineError } from "@/lib/data-access/github-refresh-budget";

vi.hoisted(() => vi.stubEnv("GITHUB_TOKEN", "test-token"));
vi.mock("@/lib/rate-limiter", () => ({ isOperationAllowed: () => true }));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
afterAll(() => vi.unstubAllEnvs());

describe("GitHub upstream contracts", () => {
  it.each(["GraphQL", "REST"])("cancels an active %s request without retrying it", async (kind) => {
    const controller = new AbortController();
    const deadline = new GitHubRefreshDeadlineError();
    let active = false;
    const upstream = vi.fn<typeof fetch>().mockImplementation((_url, options) => {
      active = true;
      return new Promise<Response>((_resolve, reject) => {
        if (!options?.signal) throw new Error("Expected propagated cancellation");
        options.signal.addEventListener(
          "abort",
          () => {
            active = false;
            reject(options.signal?.reason);
          },
          { once: true },
        );
      });
    });
    vi.stubGlobal("fetch", upstream);
    vi.useFakeTimers();
    const operation =
      kind === "GraphQL"
        ? fetchContributionYears("owner", controller.signal)
        : fetchContributorStats("owner", "repo", controller.signal);
    const failure = operation.catch((error) => error);
    await vi.advanceTimersByTimeAsync(1);
    expect(active).toBe(true);
    controller.abort(deadline);
    expect(await failure).toBe(deadline);
    expect(active).toBe(false);
    await vi.runAllTimersAsync();
    expect(upstream).toHaveBeenCalledOnce();
  });

  it.each([202, 503])(
    "cancels the HTTP %s backoff without issuing a later request",
    async (status) => {
      const controller = new AbortController();
      const deadline = new GitHubRefreshDeadlineError();
      const upstream = vi
        .fn<typeof fetch>()
        .mockImplementation(async () => new Response(null, { status }));
      vi.stubGlobal("fetch", upstream);
      vi.useFakeTimers();
      const operation =
        status === 202
          ? fetchContributorStats("owner", "repo", controller.signal)
          : fetchContributionYears("owner", controller.signal);
      const failure = operation.catch((error) => error);
      await vi.advanceTimersByTimeAsync(1);
      controller.abort(deadline);
      expect(await failure).toBe(deadline);
      await vi.runAllTimersAsync();
      expect(upstream).toHaveBeenCalledOnce();
    },
  );

  it("does not request the next repository page after cancellation", async () => {
    const controller = new AbortController();
    const deadline = new GitHubRefreshDeadlineError();
    const upstream = vi.fn<typeof fetch>().mockImplementation(async () => {
      controller.abort(deadline);
      return Response.json({
        data: {
          user: {
            id: "user-id",
            repositoriesContributedTo: {
              nodes: [],
              pageInfo: { hasNextPage: true, endCursor: "next-page" },
            },
          },
        },
      });
    });
    vi.stubGlobal("fetch", upstream);
    await expect(fetchContributedRepositories("owner", controller.signal)).rejects.toBe(deadline);
    expect(upstream).toHaveBeenCalledOnce();
  });

  it.each([429, 503])(
    "recovers from HTTP %s before publishing contribution years",
    async (status) => {
      const upstream = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(null, { status }))
        .mockResolvedValueOnce(
          Response.json({
            data: { user: { contributionsCollection: { contributionYears: [2025] } } },
          }),
        );
      vi.stubGlobal("fetch", upstream);
      vi.useFakeTimers();
      const result = fetchContributionYears("owner");
      await vi.runAllTimersAsync();
      await expect(result).resolves.toEqual([2025]);
      expect(upstream).toHaveBeenCalledTimes(2);
    },
  );

  it.each([429, 503])(
    "bounds HTTP %s exhaustion and preserves its transient classification",
    async (status) => {
      const upstream = vi
        .fn<typeof fetch>()
        .mockImplementation(async () => new Response(null, { status }));
      vi.stubGlobal("fetch", upstream);
      vi.useFakeTimers();
      const failure = fetchContributionYears("owner").catch((error) => error);
      await vi.runAllTimersAsync();
      expect(await failure).toMatchObject({
        name: "GitHubUpstreamUnavailableError",
        reason: status === 429 ? "upstream-rate-limit" : "upstream-unavailable",
      });
      expect(upstream).toHaveBeenCalledTimes(4);
    },
  );

  it("aborts each timed-out GitHub request before retrying and classifies exhaustion", async () => {
    let activeRequests = 0;
    const upstream = vi.fn<typeof fetch>().mockImplementation((_url, options) => {
      expect(activeRequests).toBe(0);
      activeRequests++;
      return new Promise<Response>((_resolve, reject) => {
        if (!options?.signal) throw new Error("Expected request cancellation signal");
        options.signal.addEventListener(
          "abort",
          () => {
            activeRequests--;
            reject(new DOMException("Request aborted", "AbortError"));
          },
          { once: true },
        );
      });
    });
    vi.stubGlobal("fetch", upstream);
    vi.useFakeTimers();
    const failure = fetchContributionYears("owner").catch((error) => error);
    await vi.runAllTimersAsync();
    expect(await failure).toMatchObject({
      name: "GitHubUpstreamUnavailableError",
      reason: "upstream-timeout",
    });
    expect(upstream).toHaveBeenCalledTimes(4);
    expect(activeRequests).toBe(0);
  });

  it.each([401, 403])("does not retry or degrade configuration HTTP %s", async (status) => {
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status }));
    vi.stubGlobal("fetch", upstream);
    await expect(fetchContributionYears("owner")).rejects.not.toBeInstanceOf(
      GitHubUpstreamUnavailableError,
    );
    expect(upstream).toHaveBeenCalledOnce();
  });

  it("does not retry or classify schema failures as transient", async () => {
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ data: { user: {} } }));
    vi.stubGlobal("fetch", upstream);
    await expect(fetchContributionYears("owner")).rejects.toMatchObject({ name: "ZodError" });
    expect(upstream).toHaveBeenCalledOnce();
  });

  it("includes repositories after the first hundred without duplicating shared nodes", async () => {
    const repositories = Array.from({ length: 101 }, (_, index) =>
      GraphQLRepoNodeSchema.parse({
        id: String(index),
        name: `repo-${index}`,
        owner: { login: "owner" },
        nameWithOwner: `owner/repo-${index}`,
        isFork: false,
        isPrivate: false,
      }),
    );
    const requestSchema = z.object({ variables: z.object({ cursor: z.string().nullable() }) });
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
        if (typeof options?.body !== "string") throw new Error("Expected a GraphQL request");
        const { variables } = requestSchema.parse(JSON.parse(options.body));
        const firstPage = variables.cursor === null;
        return Response.json({
          data: {
            user: {
              id: "user-id",
              repositoriesContributedTo: {
                nodes: firstPage ? repositories.slice(0, 100) : repositories.slice(99),
                pageInfo: { hasNextPage: firstPage, endCursor: firstPage ? "page-two" : null },
              },
            },
          },
        });
      }),
    );

    const result = await fetchContributedRepositories("owner");
    expect(result.repositories).toEqual(repositories);
  });

  it("rejects partial GraphQL calendar results rather than accepting their data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          data: { user: null },
          errors: [{ message: "Calendar unavailable" }],
        }),
      ),
    );
    await expect(fetchContributionCalendar("owner")).rejects.toThrow("Calendar unavailable");
  });

  it("does not turn an unavailable user into an empty history", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          data: { user: null },
        }),
      ),
    );
    await expect(fetchContributionYears("owner")).rejects.toThrow();
  });

  it("ignores anonymous contributors without discarding the requested contributor", () => {
    const contributors = ContributorStatsResponseSchema.parse([
      { author: null, weeks: [], total: 2 },
      { author: { login: "Owner" }, weeks: [{ w: 1, c: 7, a: 12, d: 3 }], total: 7 },
    ]);
    expect(filterContributorStats(contributors, "owner")?.weeks).toEqual([
      { w: 1, c: 7, a: 12, d: 3 },
    ]);
  });

  it.each([
    ["2026-07-13T12:00:00Z", "2025-07-14T00:00:00.000Z"],
    ["2025-01-01T23:59:59Z", "2024-01-03T00:00:00.000Z"],
    ["2024-03-01T00:00:00Z", "2023-03-03T00:00:00.000Z"],
  ])("starts a 365-day UTC calendar ending %s on %s", (now, expected) => {
    expect(getTrailingYearDate(new Date(now)).toISOString()).toBe(expected);
  });
});
