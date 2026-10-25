import { z } from "zod/v4";
import {
  fetchContributedRepositories,
  fetchContributionCalendar,
  fetchContributionYears,
} from "@/lib/data-access/github-api";
import { ContributorStatsResponseSchema, GraphQLRepoNodeSchema } from "@/types/github";
import { filterContributorStats } from "@/lib/data-access/github-processing";
import { getTrailingYearDate } from "@/lib/utils/date-format";

vi.hoisted(() => vi.stubEnv("GITHUB_TOKEN", "test-token"));
vi.mock("@/lib/rate-limiter", () => ({ waitForPermit: async () => undefined }));

afterEach(() => vi.unstubAllGlobals());
afterAll(() => vi.unstubAllEnvs());

describe("GitHub upstream contracts", () => {
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
