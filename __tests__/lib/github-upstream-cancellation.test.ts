import {
  fetchContributedRepositories,
  fetchContributionYears,
  fetchContributorStats,
} from "@/lib/data-access/github-api";
import { GitHubUpstreamUnavailableError } from "@/lib/data-access/github-refresh-outcome";
import { GitHubRefreshDeadlineError } from "@/lib/data-access/github-refresh-budget";
import { z } from "zod/v4";

vi.hoisted(() => vi.stubEnv("GITHUB_TOKEN", "test-token"));
vi.mock("@/lib/rate-limiter", () => ({ isOperationAllowed: () => true }));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
afterAll(() => vi.unstubAllEnvs());

describe("GitHub upstream cancellation and retry", () => {
  it.each(["historical inventory", "LOC history"])(
    "cancels the incoming %s query and stops further collection",
    async (kind) => {
      const controller = new AbortController();
      const deadline = new GitHubRefreshDeadlineError();
      let active = false;
      const upstream = vi.fn<typeof fetch>().mockImplementation(async (url, options) => {
        if (String(url).includes("/stats/contributors")) {
          return Response.json([
            { author: { login: "owner" }, weeks: [{ w: 1, c: 5, a: 0, d: 0 }] },
          ]);
        }
        if (typeof options?.body !== "string") throw new Error("Expected GraphQL request");
        const { query } = z.object({ query: z.string() }).parse(JSON.parse(options.body));
        if (query.includes("repositoriesContributedTo")) {
          return Response.json({
            data: {
              user: {
                id: "user-id",
                repositoriesContributedTo: {
                  nodes: [],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          });
        }
        if (query.includes("contributionYears")) {
          return Response.json({
            data: { user: { contributionsCollection: { contributionYears: [2025, 2024] } } },
          });
        }
        active = true;
        return new Promise<Response>((_resolve, reject) => {
          if (!options.signal) throw new Error("Expected history cancellation signal");
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
        kind === "historical inventory"
          ? fetchContributedRepositories("owner", controller.signal)
          : fetchContributorStats("owner", "repo", "owner", controller.signal);
      const failure = operation.catch((error) => error);
      await vi.advanceTimersByTimeAsync(1);
      expect(active).toBe(true);
      controller.abort(deadline);
      expect(await failure).toBe(deadline);
      expect(active).toBe(false);
      await vi.runAllTimersAsync();
      expect(upstream).toHaveBeenCalledTimes(kind === "historical inventory" ? 3 : 2);
    },
  );

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
        : fetchContributorStats("owner", "repo", "owner", controller.signal);
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
          ? fetchContributorStats("owner", "repo", "owner", controller.signal)
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
});
