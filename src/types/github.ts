import { z } from "zod/v4";
import {
  repoRawWeeklyStatSchema,
  type GitHubActivitySegment,
  type GitHubActivitySummary,
} from "./schemas/github-storage";

/**
 * GitHub Activity Types
 *
 * Type definitions for fetching and displaying GitHub contribution data.
 */

/**
 * Schema for GitHub GraphQL repository node
 */
export const GraphQLRepoNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  owner: z.object({
    login: z.string(),
  }),
  nameWithOwner: z.string(),
  isFork: z.boolean(),
  isPrivate: z.boolean(),
});

export type GraphQLRepoNode = z.infer<typeof GraphQLRepoNodeSchema>;

/**
 * Schema for GitHub GraphQL contribution response
 */
export const GitHubGraphQLContributionResponseSchema = z.object({
  user: z
    .object({
      id: z.string().optional(), // User's Node ID
      repositoriesContributedTo: z.object({
        nodes: z.array(GraphQLRepoNodeSchema),
        pageInfo: z.object({
          hasNextPage: z.boolean(),
          endCursor: z.string().nullable(),
        }),
      }),
    })
    .nullable(),
});

export type GitHubGraphQLContributionResponse = z.infer<
  typeof GitHubGraphQLContributionResponseSchema
>;

export const GraphQLContributionYearsResponseSchema = z.object({
  user: z.object({
    contributionsCollection: z.object({
      contributionYears: z.array(z.number().int().positive()),
    }),
  }),
});

export const GraphQLHistoricalRepositoriesResponseSchema = z.object({
  user: z.object({
    contributionsCollection: z.object({
      totalRepositoriesWithContributedCommits: z.number().int().nonnegative(),
      hasAnyRestrictedContributions: z.boolean(),
      commitContributionsByRepository: z.array(z.object({ repository: GraphQLRepoNodeSchema })),
    }),
  }),
});

export const GraphQLRepositoryCommitCountResponseSchema = z.object({
  repository: z
    .object({
      defaultBranchRef: z
        .object({
          target: z
            .object({ history: z.object({ totalCount: z.number().int().nonnegative() }) })
            .nullable(),
        })
        .nullable(),
    })
    .nullable(),
});

/**
 * Schema for GitHub author
 */
export const GithubAuthorSchema = z.object({
  login: z.string(),
  id: z.number().optional(),
  avatar_url: z.string().optional(),
});

export type GithubAuthor = z.infer<typeof GithubAuthorSchema>;

/**
 * Schema for contributor stats entry from GitHub API
 */
export const GithubContributorStatsEntrySchema = z.object({
  author: GithubAuthorSchema.nullable(),
  weeks: z.array(repoRawWeeklyStatSchema),
  total: z.number().optional(), // Total commits for this contributor in this repo
});

export type GithubContributorStatsEntry = z.infer<typeof GithubContributorStatsEntrySchema>;

// Schema for the full contributor stats API response
export const ContributorStatsResponseSchema = z.array(GithubContributorStatsEntrySchema);

// --- START: GitHub GraphQL Contribution Calendar Schemas ---
export const GraphQLContributionDaySchema = z.object({
  contributionCount: z.number(),
  contributionLevel: z.enum([
    "NONE",
    "FIRST_QUARTILE",
    "SECOND_QUARTILE",
    "THIRD_QUARTILE",
    "FOURTH_QUARTILE",
  ]),
  date: z.string(), // YYYY-MM-DD
});

export type GraphQLContributionDay = z.infer<typeof GraphQLContributionDaySchema>;

export const GraphQLContributionWeekSchema = z.object({
  contributionDays: z.array(GraphQLContributionDaySchema),
});

export type GraphQLContributionWeek = z.infer<typeof GraphQLContributionWeekSchema>;

export const GraphQLContributionCalendarSchema = z.object({
  totalContributions: z.number(),
  weeks: z.array(GraphQLContributionWeekSchema),
});

export type GraphQLContributionCalendar = z.infer<typeof GraphQLContributionCalendarSchema>;

export const GraphQLContributionsCollectionSchema = z.object({
  contributionCalendar: GraphQLContributionCalendarSchema,
});

export type GraphQLContributionsCollection = z.infer<typeof GraphQLContributionsCollectionSchema>;

export const GraphQLUserContributionsResponseSchema = z.object({
  user: z
    .object({
      contributionsCollection: GraphQLContributionsCollectionSchema,
    })
    .nullable(),
});

export type GraphQLUserContributionsResponse = z.infer<
  typeof GraphQLUserContributionsResponseSchema
>;
// --- END: GitHub GraphQL Contribution Calendar Schemas ---

/**
 * Input for writing the GitHub activity summary
 */
export type GitHubSummaryInput = Pick<
  GitHubActivitySummary,
  "totalRepositoriesContributedTo" | "linesOfCodeByCategory"
> & {
  allTimeData: GitHubActivitySegment;
};
