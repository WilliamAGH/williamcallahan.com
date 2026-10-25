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

vi.hoisted(() => vi.stubEnv("GITHUB_TOKEN", "test-token"));
vi.mock("@/lib/rate-limiter", () => ({ waitForPermit: async () => undefined }));

afterEach(() => vi.unstubAllGlobals());
afterAll(() => vi.unstubAllEnvs());

describe("GitHub upstream contracts", () => {
  it("splits capped historical windows instead of losing the 101st repository", async () => {
    const repos = Array.from({ length: 101 }, (_, index) =>
      GraphQLRepoNodeSchema.parse({
        id: String(index),
        name: `repo-${index}`,
        nameWithOwner: `owner/repo-${index}`,
        owner: { login: "owner" },
        isFork: false,
        isPrivate: false,
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
        if (typeof options?.body !== "string") throw new Error("Expected GraphQL request");
        const { query, variables } = z
          .object({
            query: z.string(),
            variables: z.object({ from: z.string().optional(), to: z.string().optional() }),
          })
          .parse(JSON.parse(options.body));
        if (query.includes("contributionYears"))
          return Response.json({
            data: { user: { contributionsCollection: { contributionYears: [2024] } } },
          });
        if (query.includes("commitContributionsByRepository")) {
          const fullYear =
            variables.from === "2024-01-01T00:00:00.000Z" &&
            variables.to === "2024-12-31T23:59:59.999Z";
          const visible = fullYear
            ? repos.slice(0, 100)
            : variables.from?.startsWith("2024-01-")
              ? repos.slice(0, 51)
              : repos.slice(51);
          return Response.json({
            data: {
              user: {
                contributionsCollection: {
                  totalRepositoriesWithContributedCommits: fullYear ? 101 : visible.length,
                  hasAnyRestrictedContributions: false,
                  commitContributionsByRepository: visible.map((repository) => ({ repository })),
                },
              },
            },
          });
        }
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
      }),
    );
    const result = await fetchContributedRepositories("owner");
    expect(result.repositories.map((repository) => repository.id).toSorted()).toEqual(
      repos.map((repository) => repository.id).toSorted(),
    );
    expect(result.dataComplete).toBe(true);
  });

  it.each(["restricted", "mismatch", "failure"])(
    "does not certify %s historical repository inventory",
    async (reason) => {
      const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      try {
        vi.stubGlobal(
          "fetch",
          vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
            if (typeof options?.body !== "string") throw new Error("Expected GraphQL request");
            const { query } = z.object({ query: z.string() }).parse(JSON.parse(options.body));
            if (query.includes("contributionYears"))
              return Response.json({
                data: { user: { contributionsCollection: { contributionYears: [2024] } } },
              });
            if (query.includes("commitContributionsByRepository")) {
              if (reason === "failure")
                return Response.json({ errors: [{ message: "History unavailable" }] });
              return Response.json({
                data: {
                  user: {
                    contributionsCollection: {
                      totalRepositoriesWithContributedCommits: reason === "mismatch" ? 1 : 0,
                      hasAnyRestrictedContributions: reason === "restricted",
                      commitContributionsByRepository: [],
                    },
                  },
                },
              });
            }
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
          }),
        );
        const result = await fetchContributedRepositories("owner");
        expect(result.dataComplete).toBe(false);
        if (reason === "failure") expect(warning).toHaveBeenCalled();
      } finally {
        warning.mockRestore();
      }
    },
  );

  it("includes historical private repositories once across contribution years", async () => {
    const current = GraphQLRepoNodeSchema.parse({
      id: "current",
      name: "current",
      nameWithOwner: "owner/current",
      owner: { login: "owner" },
      isFork: false,
      isPrivate: false,
    });
    const historical = GraphQLRepoNodeSchema.parse({
      id: "old",
      name: "old",
      nameWithOwner: "owner/old",
      owner: { login: "owner" },
      isFork: false,
      isPrivate: true,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
        if (typeof options?.body !== "string") throw new Error("Expected GraphQL request");
        const { query, variables } = z
          .object({ query: z.string(), variables: z.object({ from: z.string().optional() }) })
          .parse(JSON.parse(options.body));
        if (query.includes("contributionYears"))
          return Response.json({
            data: { user: { contributionsCollection: { contributionYears: [2025, 2024] } } },
          });
        if (query.includes("commitContributionsByRepository")) {
          const repos = variables.from?.startsWith("2024-") ? [historical, current] : [current];
          return Response.json({
            data: {
              user: {
                contributionsCollection: {
                  totalRepositoriesWithContributedCommits: repos.length,
                  hasAnyRestrictedContributions: false,
                  commitContributionsByRepository: repos.map((repository) => ({ repository })),
                },
              },
            },
          });
        }
        return Response.json({
          data: {
            user: {
              id: "user-id",
              repositoriesContributedTo: {
                nodes: [current],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        });
      }),
    );
    const result = await fetchContributedRepositories("owner");
    expect(result.repositories).toEqual([current, historical]);
  });

  it("rejects unavailable LOC from a repository with 10,000 commits", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async (url) => {
        if (String(url).includes("/stats/contributors")) {
          return Response.json([
            { author: { login: "owner" }, weeks: [{ w: 1, c: 5, a: 0, d: 0 }] },
          ]);
        }
        return Response.json({
          data: {
            repository: { defaultBranchRef: { target: { history: { totalCount: 10000 } } } },
          },
        });
      }),
    );

    await expect(fetchContributorStats("owner", "large-repo", "owner")).rejects.toThrow(
      "LOC statistics unavailable",
    );
  });

  it("accepts genuine zero LOC below GitHub's repository limit", async () => {
    const contributors = [{ author: { login: "owner" }, weeks: [{ w: 1, c: 5, a: 0, d: 0 }] }];
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async (url) => {
        if (String(url).includes("/stats/contributors")) return Response.json(contributors);
        return Response.json({
          data: { repository: { defaultBranchRef: { target: { history: { totalCount: 9999 } } } } },
        });
      }),
    );
    await expect(fetchContributorStats("owner", "small-repo", "owner")).resolves.toEqual(
      contributors,
    );
  });

  it("does not certify ambiguous zero LOC when repository history is inaccessible", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async (url) => {
        if (String(url).includes("/stats/contributors"))
          return Response.json([
            { author: { login: "owner" }, weeks: [{ w: 1, c: 5, a: 0, d: 0 }] },
          ]);
        return Response.json({ data: { repository: null } });
      }),
    );
    await expect(fetchContributorStats("owner", "hidden", "owner")).rejects.toThrow(
      "LOC statistics unavailable",
    );
  });

  it("keeps a successful response without the requested contributor authoritative", async () => {
    const contributors = [
      { author: { login: "someone-else" }, weeks: [{ w: 1, c: 5, a: 0, d: 0 }] },
    ];
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(Response.json(contributors));
    vi.stubGlobal("fetch", upstream);
    await expect(fetchContributorStats("owner", "large-repo", "owner")).resolves.toEqual(
      contributors,
    );
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
        const request = z.object({ query: z.string() }).parse(JSON.parse(options.body));
        if (request.query.includes("contributionYears")) {
          return Response.json({
            data: { user: { contributionsCollection: { contributionYears: [] } } },
          });
        }
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
